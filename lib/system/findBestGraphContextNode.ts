/**
 * lib/system/findBestGraphContextNode.ts
 *
 * Finds the graph context node whose label is most similar to the current
 * tenant context, using scoreCausalContextMatch.
 *
 * Context labels encode bands, not exact values:
 *   "warming|high_queue|low_failures|no_milestones"
 *
 * parseContextLabel reconstructs representative numeric values from band names
 * so scoreCausalContextMatch can compare them band-to-band.
 *
 * Returns null if no context nodes exist in the graph yet.
 */

import connectToDatabase           from '@/lib/mongodb';
import InterventionMemoryNode      from '@/models/InterventionMemoryNode';
import { scoreCausalContextMatch } from './scoreCausalContextMatch';
import type { ContextInput }       from './scoreCausalContextMatch';

// Reconstruct representative numeric values from band labels.
// These mid-point values are chosen to hit the correct band in scoreCausalContextMatch.
function parseContextLabel(label: string): ContextInput {
  const parts       = label.split('|');
  const runtimeState  = parts[0] ?? 'cold';
  const queueBand     = parts[1] ?? 'low_queue';
  const failBand      = parts[2] ?? 'low_failures';
  const milestoneBand = parts[3] ?? 'no_milestones';

  return {
    runtimeState,
    queueDepth:     queueBand     === 'high_queue'    ? 30 : queueBand    === 'mid_queue'     ? 10 : 2,
    recentFailures: failBand      === 'high_failures'  ? 8  : failBand     === 'mid_failures'   ? 3  : 0,
    milestoneCount: milestoneBand === 'has_milestones' ? 2  : 0,
    lifecyclePattern: [],  // not stored in label — excluded from scoring
  };
}

export interface RankedContextNode {
  nodeKey:    string;
  label:      string;
  matchScore: number;
  metadata:   { count: number; avgEffectiveness: number };
}

export async function findBestGraphContextNode(
  currentContext: ContextInput,
): Promise<RankedContextNode | null> {
  await connectToDatabase();

  const nodes = await InterventionMemoryNode
    .find({ nodeType: 'context' })
    .select('nodeKey label metadata')
    .lean() as any[];

  if (!nodes.length) return null;

  const ranked = nodes
    .map(node => ({
      nodeKey:    node.nodeKey,
      label:      node.label,
      matchScore: scoreCausalContextMatch(currentContext, parseContextLabel(node.label)),
      metadata:   node.metadata ?? { count: 0, avgEffectiveness: 0 },
    }))
    .sort((a, b) => b.matchScore - a.matchScore);

  return ranked[0];
}
