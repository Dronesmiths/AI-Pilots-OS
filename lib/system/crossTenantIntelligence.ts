/**
 * lib/system/crossTenantIntelligence.ts
 *
 * All cross-tenant intelligence — 6 exports.
 *
 *   assignTenantCohort            deterministic cohort key from 5 attributes
 *   computeTenantSimilarity       weighted attribute-match score (0-1)
 *   aggregateCohortModePerformance composite score per mode from outcome records
 *   evaluateTenantCohortDrift     detects when tenant attributes shift enough to reassign
 *   buildCrossTenantRecommendation cohort + neighbor weighted recommendation
 *   runCrossTenantIntelligenceCycle full orchestrator: DB queries → similarity → recommendation
 *
 * RULE: Local truth is primary. Cross-tenant is a prior, not an override.
 *       Only borrow from tenants with similarity >= 0.5.
 *       Never expose individual tenant records in aggregated outputs.
 */
import connectToDatabase               from '@/lib/mongodb';
import { TenantIntelligenceProfile, TenantModeOutcomeRecord, TenantCohortProfile } from '@/models/system/CrossTenantIntelligence';

const MODE_NAMES = ['conservative', 'balanced', 'aggressive', 'recovery', 'prevention_first'] as const;
type ModeName = typeof MODE_NAMES[number];

// ── 1. Cohort key assignment (pure, deterministic) ────────────────────────
export function assignTenantCohort(attrs: {
  industry:            string;
  sizeBand:            string;
  complexityBand:      string;
  governanceTolerance: string;
  changeVelocity:      string;
}): string {
  return [
    attrs.industry            || 'unknown',
    attrs.sizeBand            || 'unknown',
    attrs.complexityBand      || 'unknown',
    attrs.governanceTolerance || 'unknown',
    attrs.changeVelocity      || 'unknown',
  ].join('::');
}

// ── 2. Tenant similarity scorer (pure, weighted) ──────────────────────────
// Weights: industry 0.30, size 0.20, complexity 0.20, governance 0.15, velocity 0.15
export function computeTenantSimilarity(
  a: { industry: string; sizeBand: string; complexityBand: string; governanceTolerance: string; changeVelocity: string },
  b: { industry: string; sizeBand: string; complexityBand: string; governanceTolerance: string; changeVelocity: string }
): number {
  let score = 0;
  if (a.industry            === b.industry)            score += 0.30;
  if (a.sizeBand            === b.sizeBand)            score += 0.20;
  if (a.complexityBand      === b.complexityBand)      score += 0.20;
  if (a.governanceTolerance === b.governanceTolerance) score += 0.15;
  if (a.changeVelocity      === b.changeVelocity)      score += 0.15;
  return +score.toFixed(3);
}

// ── 3. Cohort mode performance aggregation ───────────────────────────────
// Composite score formula — mirrors federated scoring
export function aggregateCohortModePerformance(records: Array<{
  modeName:  string;
  metrics:   { costAvoided: number; downtimePrevented: number; governanceLoad: number; harmRate: number; rollbackRate: number; preventionSuccessRate: number; recoveryEfficiency: number; incidentRate: number };
  score?:    number;
}>): Record<string, number> {
  const summary: Record<string, { total: number; count: number }> = {};

  for (const r of records) {
    if (!summary[r.modeName]) summary[r.modeName] = { total: 0, count: 0 };
    const s = r.metrics;
    const computed =
      s.costAvoided           * 0.25 +
      s.downtimePrevented     * 0.20 +
      s.preventionSuccessRate * 40   +
      s.recoveryEfficiency    * 30   -
      s.governanceLoad        * 0.15 -
      s.harmRate              * 80   -
      s.rollbackRate          * 60   -
      s.incidentRate          * 30;
    summary[r.modeName].total += r.score ?? computed;
    summary[r.modeName].count += 1;
  }

  return Object.fromEntries(
    Object.entries(summary).map(([mode, v]) => [mode, v.count ? +( v.total / v.count).toFixed(2) : 0])
  );
}

// ── 4. Cohort drift evaluator ─────────────────────────────────────────────
export function evaluateTenantCohortDrift(prev: { sizeBand: string; complexityBand: string; governanceTolerance: string; changeVelocity: string }, curr: { sizeBand: string; complexityBand: string; governanceTolerance: string; changeVelocity: string }): { driftScore: number; shouldReassignCohort: boolean } {
  let drift = 0;
  if (prev.sizeBand            !== curr.sizeBand)            drift++;
  if (prev.complexityBand      !== curr.complexityBand)      drift++;
  if (prev.governanceTolerance !== curr.governanceTolerance) drift++;
  if (prev.changeVelocity      !== curr.changeVelocity)      drift++;
  return { driftScore: drift, shouldReassignCohort: drift >= 2 };
}

// ── 5. Cross-tenant recommendation builder ────────────────────────────────
export function buildCrossTenantRecommendation(input: {
  cohortPerformance:        Record<string, number>;
  neighborSignals:          Array<{ tenantId: string; similarity: number; preferredModeSignals: Record<string, number>; observationPeriods?: number }>;
  minimumSimilarity?:       number;
}): { recommendedMode: ModeName | null; rankings: Array<{ mode: string; score: number }>; neighborCount: number } {
  const minSim = input.minimumSimilarity ?? 0.5;
  const base   = { ...input.cohortPerformance };

  // Blend neighbor signals weighted by similarity × observation depth
  const qualifiedNeighbors = input.neighborSignals.filter(n => n.similarity >= minSim);
  for (const neighbor of qualifiedNeighbors) {
    const depthBonus = Math.min(neighbor.observationPeriods ?? 1, 5) / 5;  // 0.2–1.0
    for (const [mode, signal] of Object.entries(neighbor.preferredModeSignals ?? {})) {
      base[mode] = (base[mode] ?? 0) + neighbor.similarity * signal * 10 * depthBonus;
    }
  }

  const rankings = Object.entries(base)
    .map(([mode, score]) => ({ mode, score: +score.toFixed(2) }))
    .sort((a, b) => b.score - a.score);

  return {
    recommendedMode: (rankings[0]?.mode ?? null) as ModeName | null,
    rankings,
    neighborCount: qualifiedNeighbors.length,
  };
}

// ── 6. Full orchestrator ──────────────────────────────────────────────────
export async function runCrossTenantIntelligenceCycle(input: {
  tenantId:           string;
  tenantAttributes?:  any;   // if not provided, loaded from profile
  autopilotMode?:     string;
  autopilotConfidence?: number;
}): Promise<any> {
  await connectToDatabase();

  // Load or create intelligence profile
  let profile = await TenantIntelligenceProfile.findOne({ tenantId: input.tenantId }).lean() as any;
  if (!profile) {
    const attrs = input.tenantAttributes ?? {};
    const cohortKey = assignTenantCohort({
      industry: attrs.industry ?? 'unknown', sizeBand: attrs.sizeBand ?? 'unknown',
      complexityBand: attrs.complexityBand ?? 'unknown', governanceTolerance: attrs.governanceTolerance ?? 'unknown',
      changeVelocity: attrs.changeVelocity ?? 'unknown',
    });
    profile = await TenantIntelligenceProfile.create({ tenantId: input.tenantId, tenantAttributes: attrs, cohortKey, lastSyncedAt: new Date() });
  }

  const attrs     = profile.tenantAttributes ?? {};
  const cohortKey = profile.cohortKey ?? assignTenantCohort(attrs);

  // Drift check if attributes were provided
  if (input.tenantAttributes) {
    const drift = evaluateTenantCohortDrift(attrs, input.tenantAttributes);
    if (drift.shouldReassignCohort) {
      const newCohortKey = assignTenantCohort(input.tenantAttributes);
      await TenantIntelligenceProfile.findOneAndUpdate({ tenantId: input.tenantId }, { cohortKey: newCohortKey, tenantAttributes: input.tenantAttributes, lastSyncedAt: new Date() });
    }
  }

  // Load cohort mode outcome records
  const cohortRecords = await TenantModeOutcomeRecord.find({ cohortKey }).limit(200).lean() as any[];
  const cohortPerformance = aggregateCohortModePerformance(cohortRecords);

  // Load all other profiles to find neighbors (exclude self)
  const allProfiles = await TenantIntelligenceProfile.find({ tenantId: { $ne: input.tenantId } }).limit(50).lean() as any[];
  const neighborSignals = allProfiles.map((p: any) => ({
    tenantId:             p.tenantId,
    similarity:           computeTenantSimilarity(attrs, p.tenantAttributes ?? {}),
    preferredModeSignals: p.preferredModeSignals ?? {},
    observationPeriods:   p.behavioralStats?.observationPeriods ?? 1,
  }));

  // Build cross-tenant recommendation
  const crossTenantRec = buildCrossTenantRecommendation({ cohortPerformance, neighborSignals });

  // Blend with autopilot if available
  let blended: any = null;
  if (input.autopilotMode) {
    if (input.autopilotMode === crossTenantRec.recommendedMode) {
      blended = { recommendedMode: input.autopilotMode, source: 'blended', confidenceScore: Math.min(100, (input.autopilotConfidence ?? 60) + 15) };
    } else if (!crossTenantRec.recommendedMode) {
      blended = { recommendedMode: input.autopilotMode, source: 'autopilot_only', confidenceScore: input.autopilotConfidence ?? 60 };
    } else {
      blended = { recommendedMode: input.autopilotMode, source: 'autopilot_primary_cross_tenant_secondary', confidenceScore: input.autopilotConfidence ?? 60, alternativeMode: crossTenantRec.recommendedMode };
    }
  } else if (crossTenantRec.recommendedMode) {
    blended = { recommendedMode: crossTenantRec.recommendedMode, source: 'cross_tenant', confidenceScore: 55 };
  }

  // Update cohort profile
  const modePerformance: any = {};
  for (const mode of MODE_NAMES) modePerformance[mode] = cohortPerformance[mode] ?? 0;
  await TenantCohortProfile.findOneAndUpdate(
    { cohortKey },
    { cohortKey, definition: attrs, memberCount: allProfiles.filter((p: any) => (p.cohortKey ?? assignTenantCohort(p.tenantAttributes ?? {})) === cohortKey).length + 1, modePerformance, lastRefreshedAt: new Date() },
    { upsert: true, new: true }
  );

  return { tenantId: input.tenantId, cohortKey, cohortPerformance, crossTenantRecommendation: crossTenantRec, blended, neighborCount: neighborSignals.filter(n => n.similarity >= 0.5).length };
}
