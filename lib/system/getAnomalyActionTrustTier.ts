/**
 * lib/system/getAnomalyActionTrustTier.ts
 *
 * Pure function — no DB calls.
 * Given evidence stats, assigns a trust tier and score.
 *
 * 5 tiers (in order of strictness):
 *   elite      score=95  Strong evidence, very low risk, high resolution
 *   trusted    score=78  Positive evidence, acceptable downside
 *   watch      score=40–50  Mixed / insufficient evidence
 *   risky      score=28  Weak or unstable evidence, elevated downside
 *   probation  score=10  Harmful or highly unreliable
 *
 * All thresholds ENV-configurable so you can tune without redeploys.
 * Rates are 0–1 (not percentages).
 */

export type TrustTier = 'elite' | 'trusted' | 'watch' | 'risky' | 'probation';

export interface TrustTierResult {
  tier:   TrustTier;
  score:  number;
  label:  string;
  reason: string;
}

export interface TrustEvidenceInput {
  sampleCount:      number;
  avgEffectiveness: number;
  improvedRate:     number; // 0–1
  worsenedRate:     number; // 0–1
  resolvedRate:     number; // 0–1
}

// ── Thresholds (ENV-configurable) ────────────────────────────────────────────
const MIN_EVAL_SAMPLES     = parseInt(process.env.TIER_MIN_EVAL_SAMPLES     ?? '5',    10);
const PROBATION_WORSENED   = parseFloat(process.env.TIER_PROBATION_WORSENED ?? '0.25');
const ELITE_SAMPLES        = parseInt(process.env.TIER_ELITE_SAMPLES        ?? '10',   10);
const ELITE_EFF            = parseFloat(process.env.TIER_ELITE_EFF          ?? '15');
const ELITE_IMPROVED       = parseFloat(process.env.TIER_ELITE_IMPROVED     ?? '0.7');
const ELITE_WORSENED       = parseFloat(process.env.TIER_ELITE_WORSENED     ?? '0.05');
const ELITE_RESOLVED       = parseFloat(process.env.TIER_ELITE_RESOLVED     ?? '0.6');
const TRUSTED_SAMPLES      = parseInt(process.env.TIER_TRUSTED_SAMPLES      ?? '8',    10);
const TRUSTED_EFF          = parseFloat(process.env.TIER_TRUSTED_EFF        ?? '8');
const TRUSTED_IMPROVED     = parseFloat(process.env.TIER_TRUSTED_IMPROVED   ?? '0.55');
const TRUSTED_WORSENED     = parseFloat(process.env.TIER_TRUSTED_WORSENED   ?? '0.1');
const RISKY_WORSENED       = parseFloat(process.env.TIER_RISKY_WORSENED     ?? '0.15');
const RISKY_EFF_CEILING    = parseFloat(process.env.TIER_RISKY_EFF_CEILING  ?? '3');

export function getAnomalyActionTrustTier(evidence: TrustEvidenceInput): TrustTierResult {
  // ── Insufficient data ──────────────────────────────────────────────────────
  if (evidence.sampleCount < MIN_EVAL_SAMPLES) {
    return { tier: 'watch', score: 40, label: 'Watch', reason: `Need ${MIN_EVAL_SAMPLES}+ samples (have ${evidence.sampleCount})` };
  }

  // ── Probation: harmful ────────────────────────────────────────────────────
  if (evidence.worsenedRate >= PROBATION_WORSENED || evidence.avgEffectiveness < 0) {
    return {
      tier:  'probation',
      score: 10,
      label: 'Probation',
      reason: evidence.worsenedRate >= PROBATION_WORSENED
        ? `Worsened rate ${Math.round(evidence.worsenedRate * 100)}% ≥ ${PROBATION_WORSENED * 100}% threshold`
        : `Negative avg effectiveness (${evidence.avgEffectiveness.toFixed(1)})`,
    };
  }

  // ── Elite: strong + safe ──────────────────────────────────────────────────
  if (
    evidence.sampleCount      >= ELITE_SAMPLES   &&
    evidence.avgEffectiveness >= ELITE_EFF        &&
    evidence.improvedRate     >= ELITE_IMPROVED   &&
    evidence.worsenedRate     <= ELITE_WORSENED   &&
    evidence.resolvedRate     >= ELITE_RESOLVED
  ) {
    return {
      tier:  'elite',
      score: 95,
      label: 'Elite',
      reason: `${evidence.sampleCount} samples · avg +${evidence.avgEffectiveness.toFixed(0)} · ${Math.round(evidence.resolvedRate * 100)}% resolved`,
    };
  }

  // ── Trusted: good evidence, manageable risk ───────────────────────────────
  if (
    evidence.sampleCount      >= TRUSTED_SAMPLES  &&
    evidence.avgEffectiveness >= TRUSTED_EFF       &&
    evidence.improvedRate     >= TRUSTED_IMPROVED  &&
    evidence.worsenedRate     <= TRUSTED_WORSENED
  ) {
    return {
      tier:  'trusted',
      score: 78,
      label: 'Trusted',
      reason: `Good evidence with manageable risk (worsened ${Math.round(evidence.worsenedRate * 100)}%)`,
    };
  }

  // ── Risky: elevated downside ──────────────────────────────────────────────
  if (evidence.worsenedRate >= RISKY_WORSENED || evidence.avgEffectiveness <= RISKY_EFF_CEILING) {
    return {
      tier:  'risky',
      score: 28,
      label: 'Risky',
      reason: evidence.worsenedRate >= RISKY_WORSENED
        ? `Elevated worsened rate ${Math.round(evidence.worsenedRate * 100)}%`
        : `Weak effectiveness (avg +${evidence.avgEffectiveness.toFixed(1)})`,
    };
  }

  // ── Watch: moderate, continue monitoring ──────────────────────────────────
  return { tier: 'watch', score: 50, label: 'Watch', reason: 'Moderate evidence — continue monitoring' };
}
