/**
 * lib/system/runRuntimeStateTransition.ts
 *
 * Reads current metrics → evaluates next state → writes if changed.
 * Call every supervisor cycle and after each recovery wave.
 *
 * Returns the (possibly updated) state document.
 * All writes are idempotent — safe to call frequently.
 */

import connectToDatabase    from '@/lib/mongodb';
import SystemRuntimeState   from '@/models/SystemRuntimeState';
import { evaluateRuntimeState, type RuntimeState } from './evaluateRuntimeState';

export async function runRuntimeStateTransition() {
  await connectToDatabase();

  // Upsert the singleton if it doesn't exist
  let doc = await SystemRuntimeState.findOne({ systemKey: 'primary' });
  if (!doc) {
    doc = await SystemRuntimeState.create({
      systemKey: 'primary',
      state:     'cold',
      bootedAt:  new Date(),
      metrics:   {},
      notes:     ['Runtime state initialized'],
    });
    console.log(JSON.stringify({ ts: new Date(), action: 'runtime_state_init', state: 'cold' }));
    return doc;
  }

  const current  = doc.state as RuntimeState;
  const next     = evaluateRuntimeState(doc.metrics as any, current);

  if (next === current) return doc; // no-op — most common case

  // Transition
  const note = `${new Date().toISOString()} | ${current} → ${next}`;
  const notes = [...(doc.notes ?? []), note].slice(-20);

  const update: Record<string, any> = { state: next, notes };
  if (next === 'warm'     && !doc.warmedAt)   update.warmedAt   = new Date();
  if (next === 'degraded'                   ) update.degradedAt = new Date();

  await SystemRuntimeState.updateOne({ systemKey: 'primary' }, { $set: update });

  console.log(JSON.stringify({ ts: new Date(), action: 'runtime_state_transition', from: current, to: next }));

  doc.state = next as any;
  return doc;
}
