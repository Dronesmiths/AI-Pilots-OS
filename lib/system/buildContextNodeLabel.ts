/**
 * lib/system/buildContextNodeLabel.ts
 *
 * Pure function — builds a compact, deterministic context node label.
 * Used as the context node key in InterventionMemoryGraph.
 *
 * Format: "{runtimeState}|{queueBand}|{failureBand}|{milestoneBand}"
 * Example: "warming|high_queue|low_failures|no_milestones"
 *
 * Band thresholds match scoreCausalContextMatch.ts for consistency.
 */

export function buildContextNodeLabel(context: {
  runtimeState:   string;
  queueDepth:     number;
  recentFailures: number;
  milestoneCount: number;
}): string {
  const queueBand =
    context.queueDepth     > 20 ? 'high_queue'    :
    context.queueDepth     >  5 ? 'mid_queue'     : 'low_queue';

  const failBand =
    context.recentFailures > 5  ? 'high_failures' :
    context.recentFailures > 1  ? 'mid_failures'  : 'low_failures';

  const milestoneBand =
    context.milestoneCount > 0  ? 'has_milestones' : 'no_milestones';

  return `${context.runtimeState}|${queueBand}|${failBand}|${milestoneBand}`;
}
