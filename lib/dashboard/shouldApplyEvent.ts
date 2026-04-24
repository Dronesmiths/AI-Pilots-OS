/**
 * lib/dashboard/shouldApplyEvent.ts
 *
 * Sequence-based gate — prevents a replayed or duplicate event from
 * being applied to state that has already advanced past that point.
 *
 * Rules:
 *   eventSequence = 0    → unsequenced (heartbeat, live event without persist)
 *                          → ALWAYS apply (we have no basis to reject it)
 *   eventSequence <= last → already applied or from before our baseline
 *                          → SKIP
 *   eventSequence > last  → genuinely new → APPLY
 *
 * This is the guard called before reduceDashboardState() in useDashboardSession.
 */
export function shouldApplyEvent({
  eventSequence,
  lastAppliedSequence,
}: {
  eventSequence:       number;
  lastAppliedSequence: number;
}): boolean {
  // Unsequenced events (heartbeats, live counters) are always applied
  if (eventSequence === 0) return true;
  return eventSequence > lastAppliedSequence;
}
