/**
 * lib/system/getActionExecutionMode.ts
 *
 * Pure function — given aggregate performance stats for an (anomaly, action) pair,
 * returns the recommended execution mode.
 *
 * Used by generateAnomalyActions to override autoExecutable when Nova has
 * enough evidence that a particular action consistently fails for a given anomaly.
 *
 * Thresholds:
 *   count >= 5 AND avgEffectiveness < 0   → recommend_only (too risky to auto-run)
 *   count >= 5 AND avgEffectiveness > 10  → auto_preferred (strong signal, lean in)
 *   else                                  → default (use action plan's autoExecutable flag)
 */

export type ExecutionMode = 'recommend_only' | 'auto_preferred' | 'default';

export interface ActionPerformanceStats {
  count:            number;
  avgEffectiveness: number;
  improvedRate?:    number;
  worsenedRate?:    number;
  resolvedRate?:    number;
}

const MIN_SAMPLE_COUNT    = parseInt(process.env.ACTION_LEARNING_MIN_SAMPLES  ?? '5',  10);
const AUTO_PREFERRED_MIN  = parseInt(process.env.ACTION_LEARNING_AUTO_THRESHOLD ?? '10', 10);

export function getActionExecutionMode(perf: ActionPerformanceStats): ExecutionMode {
  if (perf.count < MIN_SAMPLE_COUNT) return 'default'; // not enough data yet

  if (perf.avgEffectiveness < 0)             return 'recommend_only';
  if (perf.avgEffectiveness > AUTO_PREFERRED_MIN) return 'auto_preferred';

  return 'default';
}
