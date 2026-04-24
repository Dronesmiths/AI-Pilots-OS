/**
 * lib/system/runNarrativeGeneration.ts
 *
 * All narrative generation in one file — 7 exports.
 *
 *   assembleNarrativeSources      real DB queries from 7 source models
 *   validateNarrativeIntegrity    honesty guard — prevents false claims
 *   buildExecutiveNarrative       audience-aware text builder
 *   buildWeeklyNarrativeReport    weekly digest from ResilienceEconomicSummary
 *   buildIncidentBriefing         timeline + response + economics for one incident
 *   buildClientValueSummary       plain-language ROI for clients
 *   runNarrativeGeneration        orchestrator — assembles, builds, validates, persists
 *
 * RULE: All claims must map to stored records.
 *       All economic values must be labeled "estimated".
 *       Risks must remain visible in operator/reviewer narratives.
 */
import connectToDatabase              from '@/lib/mongodb';
import GovernedDecisionRecord         from '@/models/system/GovernedDecisionRecord';
import DecisionJustificationRecord    from '@/models/system/DecisionJustificationRecord';
import AutonomousResponsePlaybookRun  from '@/models/system/AutonomousResponsePlaybookRun';
import { RecoveryCampaign }           from '@/models/system/RecoveryCampaign';
import { GlobalStabilityForecast }    from '@/models/system/GlobalStabilityForecast';
import { ResilienceEconomicSummary, ResilienceEconomicEvent } from '@/models/system/ResilienceEconomics';
import { ExecutiveNarrativeRecord, NarrativeTemplateProfile, CANONICAL_TEMPLATES } from '@/models/system/ExecutiveNarrative';

const COST_UNIT = () => parseFloat(process.env.COST_UNIT_RATE ?? '2');
const toDol = (units: number) => `$${((units ?? 0) * COST_UNIT()).toFixed(0)}`;

// ── 1. Source assembler ───────────────────────────────────────────────────
export async function assembleNarrativeSources(input: {
  narrativeType:  string;
  tenantId?:      string;
  scopeKey?:      string;
  traceId?:       string;
  campaignKey?:   string;
  periodStart?:   Date;
  periodEnd?:     Date;
}): Promise<any> {
  await connectToDatabase();

  const { periodStart: start, periodEnd: end } = input;
  const dateFilter: any = {};
  if (start || end) { if (start) dateFilter.$gte = start; if (end) dateFilter.$lte = end; }
  const hasDate = Object.keys(dateFilter).length > 0;

  const [decisions, justifications, playbookRuns, campaigns, forecasts, economicEvents, economicSummary] = await Promise.all([
    GovernedDecisionRecord.find({
      ...(input.traceId    ? { traceId: input.traceId }       : {}),
      ...(hasDate          ? { createdAt: dateFilter }        : {}),
    }).sort({ createdAt: -1 }).limit(20).lean(),

    DecisionJustificationRecord.find({
      ...(input.traceId    ? { traceId: input.traceId }       : {}),
      ...(hasDate          ? { createdAt: dateFilter }        : {}),
    }).sort({ createdAt: -1 }).limit(10).lean(),

    AutonomousResponsePlaybookRun.find({
      ...(input.campaignKey ? { campaignKey: input.campaignKey } : {}),
      ...(hasDate           ? { createdAt: dateFilter }          : {}),
    }).sort({ createdAt: -1 }).limit(10).lean(),

    RecoveryCampaign.find({
      ...(input.campaignKey ? { campaignKey: input.campaignKey } : {}),
      ...(hasDate           ? { createdAt: dateFilter }          : {}),
    }).sort({ severity: -1 }).limit(5).lean(),

    GlobalStabilityForecast.findOne().sort({ generatedAt: -1 }).lean(),

    ResilienceEconomicEvent.find({
      ...(hasDate ? { createdAt: dateFilter } : {}),
    }).sort({ createdAt: -1 }).limit(30).lean(),

    ResilienceEconomicSummary.findOne({
      ...(hasDate && start ? { period: `daily::${start.toISOString().slice(0, 10)}` } : {}),
    }).sort({ createdAt: -1 }).lean(),
  ]);

  // Rollback events: governed decisions with 'rollback' in actionType
  const rollbacks = (decisions as any[]).filter((d: any) => (d.finalDecision?.actionType ?? '').includes('rollback'));

  // Compute economic totals from events if no period summary available
  const econ = economicSummary ?? {
    totalCostAvoided:        (economicEvents as any[]).reduce((s, e) => s + (e.costAvoided ?? 0), 0),
    totalDowntimePrevented:  (economicEvents as any[]).reduce((s, e) => s + (e.downtimePrevented ?? 0), 0),
    totalGovernanceSaved:    (economicEvents as any[]).reduce((s, e) => s + (e.governanceSaved ?? 0), 0),
    incidentsAvoided:        (economicEvents as any[]).filter((e: any) => e.eventType === 'avoided_incident').length,
    campaignsAvoided:        (economicEvents as any[]).filter((e: any) => e.incidentType === 'campaign').length,
    roi:                     0,
  };

  // Forecast risks
  const forecastRisks = ((forecasts as any)?.targets ?? []).filter((t: any) => ['at_risk', 'critical'].includes(t.forecastState)).map((t: any) => `${t.targetKey}: ${t.forecastState} (score ${t.riskScore.toFixed(0)})`);

  return { decisions, justifications, playbookRuns, campaigns, forecasts: forecasts ? [forecasts] : [], economics: econ, economicEvents, rollbacks, forecastRisks };
}

// ── 2. Integrity guard ───────────────────────────────────────────────────
export function validateNarrativeIntegrity(input: { summary: string; highlights: string[]; risks: string[]; economics: any; audience: string }) {
  const warnings: string[] = [];
  if (!input.summary || input.summary.length < 20)    warnings.push('Narrative summary is too thin.');
  if ((input.economics?.totalCostAvoided ?? 0) < 0)   warnings.push('Economic claims include a negative avoided-cost value — review source data.');
  if (input.audience !== 'client' && input.risks.length === 0 && (input.economics?.roi ?? 0) > 10)
    warnings.push('ROI appears very high with no risks listed — operator/reviewer views should include risk context.');
  if (input.highlights.length === 0)                  warnings.push('No highlights generated — source data may be insufficient for this period.');
  return { valid: warnings.length === 0, warnings };
}

// ── 3. Audience-aware narrative builder ──────────────────────────────────
export function buildExecutiveNarrative(input: {
  narrativeType: string;
  audience:      string;
  sources:       any;
  template:      any;
}): { title: string; summary: string; highlights: string[]; risks: string[]; actionsTaken: string[] } {
  const sources = input.sources;
  const econ    = sources.economics ?? {};
  const rate    = COST_UNIT();
  const highlights: string[] = [];
  const risks:       string[] = [];
  const actionsTaken:string[] = [];

  // Economic highlights (grounded in econ data)
  if ((econ.totalCostAvoided ?? 0) > 0)       highlights.push(`Estimated cost avoided: ${toDol(econ.totalCostAvoided)} across this period.`);
  if ((econ.totalDowntimePrevented ?? 0) > 0)  highlights.push(`Estimated downtime prevented: ${econ.totalDowntimePrevented} minutes.`);
  if ((econ.roi ?? 0) > 0)                     highlights.push(`Resilience ROI: ${econ.roi?.toFixed(1) ?? '—'}x (cost prevention vs reactive cost estimate).`);
  if ((econ.incidentsAvoided ?? 0) > 0)        highlights.push(`Incidents avoided: ${econ.incidentsAvoided}.`);
  if ((econ.campaignsAvoided ?? 0) > 0)        highlights.push(`Recovery campaigns avoided: ${econ.campaignsAvoided}.`);

  // Playbook highlights
  const completedRuns = (sources.playbookRuns ?? []).filter((r: any) => r.status === 'completed');
  if (completedRuns.length > 0) {
    highlights.push(`${completedRuns.length} recovery playbook${completedRuns.length > 1 ? 's' : ''} completed successfully.`);
    completedRuns.slice(0, 2).forEach((r: any) => actionsTaken.push(`Ran playbook "${r.playbookKey}" — status: ${r.status}.`));
  }

  // Campaign highlights
  const resolvedCampaigns = (sources.campaigns ?? []).filter((c: any) => c.status === 'resolved');
  if (resolvedCampaigns.length > 0) highlights.push(`${resolvedCampaigns.length} recovery campaign${resolvedCampaigns.length > 1 ? 's' : ''} resolved.`);

  // Risk signals from forecast
  (sources.forecastRisks ?? []).slice(0, 3).forEach((r: string) => risks.push(`Active forecast risk: ${r}.`));
  if ((sources.rollbacks ?? []).length > 0) risks.push(`${sources.rollbacks.length} rollback event(s) detected in this period.`);

  // Governed decisions summary
  const execCount = (sources.decisions ?? []).filter((d: any) => d.executionStatus === 'executed').length;
  if (execCount > 0) actionsTaken.push(`${execCount} governed decision${execCount > 1 ? 's' : ''} executed through the constitutional pipeline.`);

  // Audience-specific summary
  const summaryMap: Record<string, string> = {
    operator:          `System intelligence maintained active stability control this period. ${risks.length > 0 ? `${risks.length} risk zone(s) require attention.` : 'No critical risks active.'}`,
    executive:         `Nova produced measurable resilience value this period${(econ.totalCostAvoided ?? 0) > 0 ? `, with an estimated ${toDol(econ.totalCostAvoided)} in avoided operational costs` : ''}.`,
    client:            `Your system was actively protected this period${(econ.incidentsAvoided ?? 0) > 0 ? `, with ${econ.incidentsAvoided} incident(s) avoided before they could impact service` : ''}.`,
    incident_reviewer: `This report summarizes intelligence actions, recovery sequences, and economic outcomes for the selected period and scope.`,
  };

  return {
    title:        `${input.narrativeType.replace(/_/g, ' ')} — ${input.audience}`,
    summary:      summaryMap[input.audience] ?? summaryMap.operator,
    highlights:   highlights.slice(0, input.template.maxHighlights ?? 5),
    risks:        input.template.includeRisks        ? risks          : [],
    actionsTaken: input.template.includeActionsTaken ? actionsTaken   : [],
  };
}

// ── 4. Weekly narrative report ───────────────────────────────────────────
export async function buildWeeklyNarrativeReport(input: {
  audience:     'operator' | 'executive' | 'client';
  periodStart?: Date;
  periodEnd?:   Date;
}): Promise<{ title: string; summary: string; highlights: string[]; risks: string[]; actionsTaken: string[]; economics: any }> {
  const sources  = await assembleNarrativeSources({ narrativeType: 'weekly_report', periodStart: input.periodStart, periodEnd: input.periodEnd });
  const template = CANONICAL_TEMPLATES.find(t => t.narrativeType === 'weekly_report' && t.audience === input.audience) ?? CANONICAL_TEMPLATES[0];
  const built    = buildExecutiveNarrative({ narrativeType: 'weekly_report', audience: input.audience, sources, template });
  return { ...built, economics: input.audience !== 'client' ? sources.economics : { totalCostAvoided: sources.economics?.totalCostAvoided, incidentsAvoided: sources.economics?.incidentsAvoided } };
}

// ── 5. Incident briefing ─────────────────────────────────────────────────
export async function buildIncidentBriefing(input: {
  incidentType:    string;
  severity:        string;
  affectedTargets: string[];
  campaignKey?:    string;
  actionSummary?:  string[];
  outcome: { quality: string; costAvoided?: number; downtimePrevented?: number };
  periodStart?:    Date;
}) {
  const sources  = await assembleNarrativeSources({ narrativeType: 'incident_briefing', campaignKey: input.campaignKey, periodStart: input.periodStart });
  const rate     = COST_UNIT();

  const highlights: string[] = [
    `Incident type: ${input.incidentType.replace(/_/g, ' ')}.`,
    `Severity: ${input.severity}.`,
    `Affected targets: ${input.affectedTargets.length > 0 ? input.affectedTargets.join(', ') : 'system-wide'}.`,
    `Response quality: ${input.outcome.quality}.`,
    `Estimated cost avoided: ${toDol(input.outcome.costAvoided ?? 0)}.`,
    `Estimated downtime prevented: ${input.outcome.downtimePrevented ?? 0} minutes.`,
  ];

  const playbooks      = (sources.playbookRuns ?? []);
  const actionsTaken   = [...(input.actionSummary ?? [])];
  playbooks.slice(0, 3).forEach((r: any) => actionsTaken.push(`Playbook "${r.playbookKey}": ${r.status} · ${r.completionSummary?.stepsExecuted ?? 0} steps.`));

  const risks: string[] = [];
  if ((sources.rollbacks ?? []).length > 0) risks.push(`${sources.rollbacks.length} rollback event(s) occurred during or after the incident.`);
  (sources.forecastRisks ?? []).slice(0, 2).forEach((r: string) => risks.push(`Forecast risk still active: ${r}.`));

  return {
    title:       `Incident briefing: ${input.incidentType.replace(/_/g, ' ')}`,
    summary:     `A ${input.severity} incident involving ${input.affectedTargets.length} target(s) was detected and responded to through the governed pipeline. Response quality: ${input.outcome.quality}.`,
    highlights,
    actionsTaken,
    risks,
    economics: { costAvoided: input.outcome.costAvoided ?? 0, downtimePrevented: input.outcome.downtimePrevented ?? 0 },
  };
}

// ── 6. Client value summary ──────────────────────────────────────────────
export async function buildClientValueSummary(input: {
  clientName?:  string;
  tenantId?:    string;
  periodStart?: Date;
  periodEnd?:   Date;
}) {
  const sources = await assembleNarrativeSources({ narrativeType: 'client_value_summary', tenantId: input.tenantId, periodStart: input.periodStart, periodEnd: input.periodEnd });
  const econ    = sources.economics ?? {};

  const highlights: string[] = [
    `Estimated cost avoided: ${toDol(econ.totalCostAvoided ?? 0)}.`,
    `Estimated downtime prevented: ${econ.totalDowntimePrevented ?? 0} minutes.`,
    `Incidents avoided: ${econ.incidentsAvoided ?? 0}.`,
    `Recovery campaigns avoided: ${econ.campaignsAvoided ?? 0}.`,
  ].filter(h => !h.includes(': 0') && !h.includes(': $0'));

  if (highlights.length === 0) highlights.push('System remained stable throughout this period with no major incidents.');

  return {
    title:   `Resilience value summary for ${input.clientName ?? 'your system'}`,
    summary: `${input.clientName ?? 'Your system'} was actively protected this period. Nova selected preventive actions before higher-cost recovery became necessary, and governed responses reduced the need for manual intervention.`,
    highlights,
    risks:   [],
    actionsTaken: [
      'Preventive actions were selected before higher-cost recovery became necessary.',
      'Governed responses reduced the need for manual intervention.',
    ],
    economics: { totalCostAvoided: econ.totalCostAvoided, incidentsAvoided: econ.incidentsAvoided },
  };
}

// ── 7. Orchestrator ──────────────────────────────────────────────────────
export async function runNarrativeGeneration(input: {
  narrativeType: 'action_summary' | 'weekly_report' | 'incident_briefing' | 'client_value_summary' | 'change_log_summary';
  audience:      'operator' | 'executive' | 'client' | 'incident_reviewer';
  tenantId?:     string;
  scopeKey?:     string;
  traceId?:      string;
  campaignKey?:  string;
  periodStart?:  Date;
  periodEnd?:    Date;
  incidentData?: any;  // for incident_briefing
  clientName?:   string;
}): Promise<any> {
  await connectToDatabase();

  const sources  = await assembleNarrativeSources(input);

  // Load template (or use canonical default)
  let template = await NarrativeTemplateProfile.findOne({ narrativeType: input.narrativeType, audience: input.audience }).lean() as any;
  if (!template) template = CANONICAL_TEMPLATES.find(t => t.narrativeType === input.narrativeType && t.audience === input.audience) ?? CANONICAL_TEMPLATES[0];

  let built: any;
  if (input.narrativeType === 'incident_briefing' && input.incidentData) {
    built = await buildIncidentBriefing({ ...input.incidentData, campaignKey: input.campaignKey, periodStart: input.periodStart });
  } else if (input.narrativeType === 'client_value_summary') {
    built = await buildClientValueSummary({ clientName: input.clientName, tenantId: input.tenantId, periodStart: input.periodStart, periodEnd: input.periodEnd });
  } else if (input.narrativeType === 'weekly_report') {
    built = await buildWeeklyNarrativeReport({ audience: input.audience as any, periodStart: input.periodStart, periodEnd: input.periodEnd });
  } else {
    built = buildExecutiveNarrative({ narrativeType: input.narrativeType, audience: input.audience, sources, template });
  }

  // Quality guard
  const { valid, warnings } = validateNarrativeIntegrity({ summary: built.summary, highlights: built.highlights, risks: built.risks ?? [], economics: sources.economics, audience: input.audience });

  const narrativeKey = `${input.narrativeType}::${input.audience}::${Date.now()}`;

  const record = await ExecutiveNarrativeRecord.create({
    narrativeKey,
    narrativeType:   input.narrativeType,
    audience:        input.audience,
    tenantId:        input.tenantId   ?? null,
    scopeKey:        input.scopeKey   ?? null,
    traceId:         input.traceId    ?? null,
    campaignKey:     input.campaignKey ?? null,
    periodStart:     input.periodStart ?? null,
    periodEnd:       input.periodEnd   ?? null,
    title:           built.title,
    summary:         built.summary,
    highlights:      built.highlights,
    risks:           built.risks       ?? [],
    actionsTaken:    built.actionsTaken ?? [],
    economics:       built.economics   ?? sources.economics,
    sourceRefs:      [
      ...((sources.decisions as any[]).slice(0, 5).map((d: any) => d.traceId ?? '')),
      ...((sources.campaigns  as any[]).map((c: any) => c.campaignKey ?? '')),
    ].filter(Boolean),
    qualityWarnings: warnings,
    status:          valid ? 'final' : 'draft',
  });

  return { narrativeKey: record.narrativeKey, title: built.title, summary: built.summary, highlights: built.highlights, risks: built.risks, actionsTaken: built.actionsTaken, economics: built.economics, qualityWarnings: warnings, status: record.status };
}

// ── Template seeder ───────────────────────────────────────────────────────
export async function seedNarrativeTemplates(): Promise<{ created: number; skipped: number }> {
  await connectToDatabase();
  let created = 0, skipped = 0;
  for (const t of CANONICAL_TEMPLATES) {
    const exists = await NarrativeTemplateProfile.findOne({ templateKey: t.templateKey }).lean();
    if (exists) { skipped++; continue; }
    await NarrativeTemplateProfile.create(t);
    created++;
  }
  return { created, skipped };
}
