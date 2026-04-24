/**
 * lib/system/getPolicyReviewRecommendation.ts
 *
 * Pure function — given evidence stats, returns a recommendation for
 * what the execution mode should be.
 *
 * All thresholds ENV-configurable so you can tune without redeploys.
 *
 * Recommendations:
 *   hold              < 5 samples — wait for more data
 *   disable           worsened >= 25% OR avgEff < 0
 *   promote_auto      >= 8 samples, avgEff >= 10, worsened <= 5%, resolved >= 50%
 *   approve_manual    >= 5 samples, avgEff >= 5, worsened <= 10%
 *   recommend_only    everything else (mixed/moderate evidence)
 */

export type PolicyRecommendation =
  | 'hold'
  | 'disable'
  | 'promote_auto'
  | 'approve_manual'
  | 'recommend_only';

export interface ReviewRecommendation {
  recommendation: PolicyRecommendation;
  reason:         string;
}

export interface EvidenceInput {
  sampleCount:      number;
  avgEffectiveness: number;
  improvedRate:     number;  // 0–1
  worsenedRate:     number;  // 0–1
  resolvedRate:     number;  // 0–1
}

const MIN_SAMPLES_TO_EVAL    = parseInt(process.env.POLICY_MIN_SAMPLES        ?? '5',    10);
const AUTO_MIN_SAMPLES       = parseInt(process.env.POLICY_AUTO_MIN_SAMPLES   ?? '8',    10);
const AUTO_EFF_THRESHOLD     = parseInt(process.env.POLICY_AUTO_EFF_THRESHOLD ?? '10',   10);
const AUTO_WORSENED_MAX      = parseFloat(process.env.POLICY_AUTO_WORSENED_MAX  ?? '0.05');
const AUTO_RESOLVED_MIN      = parseFloat(process.env.POLICY_AUTO_RESOLVED_MIN  ?? '0.5');
const MANUAL_EFF_THRESHOLD   = parseInt(process.env.POLICY_MANUAL_EFF_THRESHOLD ?? '5',   10);
const MANUAL_WORSENED_MAX    = parseFloat(process.env.POLICY_MANUAL_WORSENED_MAX ?? '0.1');
const DISABLE_WORSENED_MIN   = parseFloat(process.env.POLICY_DISABLE_WORSENED   ?? '0.25');

export function getPolicyReviewRecommendation(evidence: EvidenceInput): ReviewRecommendation {
  if (evidence.sampleCount < MIN_SAMPLES_TO_EVAL) {
    return { recommendation: 'hold', reason: `Need ${MIN_SAMPLES_TO_EVAL}+ samples (have ${evidence.sampleCount})` };
  }

  if (evidence.worsenedRate >= DISABLE_WORSENED_MIN || evidence.avgEffectiveness < 0) {
    return {
      recommendation: 'disable',
      reason: `High worsened rate (${Math.round(evidence.worsenedRate * 100)}%) or negative avg effectiveness (${evidence.avgEffectiveness})`,
    };
  }

  if (
    evidence.sampleCount      >= AUTO_MIN_SAMPLES    &&
    evidence.avgEffectiveness >= AUTO_EFF_THRESHOLD  &&
    evidence.worsenedRate     <= AUTO_WORSENED_MAX   &&
    evidence.resolvedRate     >= AUTO_RESOLVED_MIN
  ) {
    return {
      recommendation: 'promote_auto',
      reason: `Strong evidence: ${evidence.sampleCount} samples, avg eff +${evidence.avgEffectiveness}, resolved ${Math.round(evidence.resolvedRate * 100)}%`,
    };
  }

  if (
    evidence.sampleCount      >= MIN_SAMPLES_TO_EVAL &&
    evidence.avgEffectiveness >= MANUAL_EFF_THRESHOLD &&
    evidence.worsenedRate     <= MANUAL_WORSENED_MAX
  ) {
    return {
      recommendation: 'approve_manual',
      reason: `Useful action but not enough evidence for auto (${evidence.sampleCount} samples, avg +${evidence.avgEffectiveness})`,
    };
  }

  return { recommendation: 'recommend_only', reason: 'Mixed or moderate evidence — keep as suggestion for now' };
}
