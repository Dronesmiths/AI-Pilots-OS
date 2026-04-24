/**
 * lib/system/computeStabilityRisk.ts
 *
 * Six pure, synchronous functions for the global stability model.
 * No DB access — callers provide pre-loaded feature vectors.
 *
 *   computeStabilityRisk           weighted risk score from 14 features
 *   propagateGraphRisk             spread local risk to neighbors
 *   buildReplayInstabilitySignal   replay evidence as leading indicator
 *   computeCampaignFormationRisk   predicts when local issues cluster into campaigns
 *   emitPredictiveResponseTrigger  converts forecast state to governed trigger descriptor
 *   evaluateStabilityForecast      compares predicted vs actual for calibration
 */

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, +n.toFixed(4)));
}

// ── 1. Core risk computation ──────────────────────────────────────────────
export interface StabilityFeatures {
  arbitrationRate:            number;
  conflictDensity:            number;
  blockedRate:                number;
  rollbackScore:              number;
  replayImprovementRate:      number;
  driftScore:                 number;
  championDecayScore:         number;
  policyHarmRate:             number;
  confidenceCalibrationError: number;
  adaptiveWeightVolatility:   number;
  inheritanceMismatchRate:    number;
  campaignPressure:           number;
  governanceQueuePressure:    number;
  graphNeighborhoodRisk:      number;
}

export type ForecastState = 'stable' | 'watch' | 'at_risk' | 'critical';

export interface StabilityRiskResult {
  riskScore:     number;
  confidence:    number;
  forecastState: ForecastState;
  topFactors:    string[];
}

export function computeStabilityRisk(f: StabilityFeatures): StabilityRiskResult {
  // Feature weights — higher weight = stronger predictor of instability
  const contributions: [string, number][] = [
    ['conflictDensity',            f.conflictDensity            * 15],
    ['policyHarmRate',             f.policyHarmRate             * 15],
    ['graphNeighborhoodRisk',      f.graphNeighborhoodRisk      * 15],
    ['rollbackScore',              (f.rollbackScore / 100)      * 18],
    ['driftScore',                 f.driftScore                 * 14],
    ['arbitrationRate',            f.arbitrationRate            * 12],
    ['confidenceCalibrationError', f.confidenceCalibrationError * 12],
    ['campaignPressure',           f.campaignPressure           * 12],
    ['blockedRate',                f.blockedRate                * 10],
    ['championDecayScore',         f.championDecayScore         * 10],
    ['adaptiveWeightVolatility',   f.adaptiveWeightVolatility   *  8],
    ['replayImprovementRate',      f.replayImprovementRate      *  8],
    ['governanceQueuePressure',    f.governanceQueuePressure    *  8],
    ['inheritanceMismatchRate',    f.inheritanceMismatchRate    *  8],
  ];

  const riskScore = clamp(contributions.reduce((s, [, v]) => s + v, 0), 0, 100);

  const forecastState: ForecastState =
    riskScore >= 75 ? 'critical' :
    riskScore >= 50 ? 'at_risk'  :
    riskScore >= 28 ? 'watch'    : 'stable';

  // Confidence rises with strong leading signals
  const confidence = clamp(
    0.45 +
    Math.min(f.graphNeighborhoodRisk,   0.4) * 0.30 +
    Math.min(f.replayImprovementRate,   0.3) * 0.20 +
    Math.min(f.driftScore,              0.3) * 0.20,
    0.35, 0.95
  );

  // Top 3 contributing factors for the dashboard
  const topFactors = contributions.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);

  return { riskScore, confidence, forecastState, topFactors };
}

// ── 2. Graph risk propagation ─────────────────────────────────────────────
export function propagateGraphRisk(input: {
  localRiskScore:        number;
  graphNeighborhoodRisk: number;
  similarityWeight:      number;   // 0..1 — how similar the neighbor is
}): number {
  return clamp(
    input.localRiskScore + input.graphNeighborhoodRisk * input.similarityWeight * 20,
    0, 100
  );
}

// ── 3. Replay instability signal ──────────────────────────────────────────
export function buildReplayInstabilitySignal(input: {
  replayImprovementRate:   number;  // fraction of sessions where variant beats live
  policyDisableWinRate:    number;  // fraction where policy-disabled variant wins
  arbitrationAltWinRate:   number;  // fraction where alternate arbitration wins
}): { replayInstabilityScore: number; state: 'low' | 'medium' | 'high' } {
  const score = clamp(
    input.replayImprovementRate   * 0.40 +
    input.policyDisableWinRate    * 0.30 +
    input.arbitrationAltWinRate   * 0.30,
    0, 1
  );
  return {
    replayInstabilityScore: score,
    state: score >= 0.45 ? 'high' : score >= 0.25 ? 'medium' : 'low',
  };
}

// ── 4. Campaign formation risk ────────────────────────────────────────────
export function computeCampaignFormationRisk(input: {
  relatedScopeRiskScores: number[];
  affectedTenantCount:    number;
  graphClusterDensity:    number;   // 0..1
}): { riskScore: number } {
  const avgRisk = input.relatedScopeRiskScores.length
    ? input.relatedScopeRiskScores.reduce((a, b) => a + b, 0) / input.relatedScopeRiskScores.length
    : 0;

  const riskScore = clamp(
    avgRisk * 0.50 +
    Math.min(input.affectedTenantCount / 10, 1) * 25 +
    input.graphClusterDensity * 25,
    0, 100
  );
  return { riskScore };
}

// ── 5. Predictive response trigger descriptor ─────────────────────────────
export interface PredictiveTriggerDescriptor {
  triggerType:   string;
  responseClass: string;
  targetKey:     string;
  metrics:       Record<string, any>;
}

export function emitPredictiveResponseTrigger(input: {
  forecastState: ForecastState;
  forecastType:  string;
  targetKey:     string;
  riskScore:     number;
  confidence?:   number;
}): PredictiveTriggerDescriptor | null {
  if (input.forecastState === 'stable') return null;

  const map: Record<ForecastState, { triggerType: string; responseClass: string }> = {
    critical: { triggerType: 'predictive_instability_critical', responseClass: 'approval_required' },
    at_risk:  { triggerType: 'predictive_instability_rising',   responseClass: 'shadow' },
    watch:    { triggerType: 'predictive_watch',                responseClass: 'observe' },
    stable:   { triggerType: '',                                responseClass: 'observe' },
  };

  const { triggerType, responseClass } = map[input.forecastState];
  return { triggerType, responseClass, targetKey: input.targetKey, metrics: { riskScore: input.riskScore, forecastType: input.forecastType, confidence: input.confidence ?? 0.6 } };
}

// ── 6. Forecast accuracy evaluator ───────────────────────────────────────
const STATE_RANK: Record<ForecastState, number> = { stable: 1, watch: 2, at_risk: 3, critical: 4 };

export function evaluateStabilityForecast(input: {
  predictedRiskScore: number;
  predictedState:     ForecastState;
  actualState:        ForecastState;
}): { predictionCorrect: boolean; calibrationError: number } {
  return {
    predictionCorrect: input.predictedState === input.actualState,
    calibrationError:  clamp(Math.abs(STATE_RANK[input.predictedState] - STATE_RANK[input.actualState]) / 3, 0, 1),
  };
}
