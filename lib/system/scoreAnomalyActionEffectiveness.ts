/**
 * lib/system/scoreAnomalyActionEffectiveness.ts
 *
 * Pure function — no DB calls.
 * Given before/after snapshots + anomaly resolution status, returns a score.
 *
 * Scoring weights:
 *   healthScore delta  × 0.6  (primary signal)
 *   queueDepth delta   × 0.4  (secondary — queue relief = good)
 *   runtimeState improvement  +10 (moved up the maturity ladder)
 *   runtimeState regression   -15 (fell down — serious)
 *   anomaly resolved          +20 (the whole point)
 *   recovery recurrence       -10 (needed more recovery = not working)
 *
 * Score interpretation:
 *   > 10  = improved
 *   < -10 = worsened
 *   else  = neutral
 */

const RUNTIME_RANK: Record<string, number> = {
  cold:     0,
  warming:  1,
  warm:     2,
  degraded: -1,
};

export interface EffectivenessSnapshot {
  healthScore:      number;
  runtimeState:     string;
  queueDepth:       number;
  recoveryCount24h: number;
}

export interface EffectivenessInput {
  before:           EffectivenessSnapshot;
  after:            EffectivenessSnapshot;
  anomalyStillOpen: boolean;
}

export interface EffectivenessResult {
  effectivenessScore: number;
  improved:           boolean;
  worsened:           boolean;
  anomalyResolved:    boolean;
  notes:              string;
}

export function scoreAnomalyActionEffectiveness(input: EffectivenessInput): EffectivenessResult {
  let score = 0;

  const healthDelta = (input.after.healthScore ?? 0) - (input.before.healthScore ?? 0);
  // Queue depth relief: before > after = good (queue drained)
  const queueDelta  = (input.before.queueDepth ?? 0) - (input.after.queueDepth ?? 0);

  score += healthDelta * 0.6;
  score += queueDelta  * 0.4;

  const beforeRank = RUNTIME_RANK[input.before.runtimeState] ?? 0;
  const afterRank  = RUNTIME_RANK[input.after.runtimeState]  ?? 0;
  if (afterRank > beforeRank) score += 10;  // moved up maturity ladder
  if (afterRank < beforeRank) score -= 15;  // regressed — serious signal

  if (!input.anomalyStillOpen)                                        score += 20;
  if (input.after.recoveryCount24h > input.before.recoveryCount24h)  score -= 10;

  const effectivenessScore = Math.round(score);
  const improved           = effectivenessScore > 10;
  const worsened           = effectivenessScore < -10;
  const anomalyResolved    = !input.anomalyStillOpen;

  const notes = improved        ? 'Action improved tenant condition'
    : worsened                  ? 'Action correlated with worse state'
    : anomalyResolved           ? 'Anomaly resolved, effect unclear'
    :                             'Neutral or insufficient data';

  return { effectivenessScore, improved, worsened, anomalyResolved, notes };
}
