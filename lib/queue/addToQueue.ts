/**
 * lib/queue/addToQueue.ts
 *
 * Pushes a new keyword/page into the user's existing seoClusters array
 * with status "queued" so masterDrone picks it up automatically.
 *
 * Architectural decision:
 *   DO NOT create a parallel QueuedPage collection.
 *   seoClusters IS the queue. masterDrone + 3-layer throttle already govern it.
 *   Adding to seoClusters = zero additional plumbing needed.
 */

import connectToDatabase              from '@/lib/mongodb';
import User                           from '@/models/User';
import mongoose                       from 'mongoose';
import { publish }                    from '@/lib/queue/eventBus';
import { triggerAutopilotIfNeeded }   from '@/lib/autopilot/triggerAutopilotIfNeeded';

export interface QueuePageInput {
  tenantId:  string;   // MongoDB _id string of the User
  keyword:   string;
  location?: string;
  category?: 'service' | 'location' | 'qa' | 'cornerstone' | 'blog' | 'article';
  source?:   string;   // for audit — e.g. "ai_suggestion" | "manual"
}

export interface QueuePageResult {
  ok:        boolean;
  clusterId?: string;
  error?:    string;
  duplicate?: boolean;
}

export async function addToQueue(input: QueuePageInput): Promise<QueuePageResult> {
  await connectToDatabase();

  const { tenantId, keyword, location, category = 'service', source = 'ai_suggestion' } = input;

  if (!keyword?.trim()) return { ok: false, error: 'keyword is required' };

  // Resolve user by  ObjectId OR by name slug fallback
  let user: any = null;
  if (mongoose.isValidObjectId(tenantId)) {
    user = await User.findById(tenantId, { _id: 1, seoClusters: 1 }).lean();
  }
  if (!user) return { ok: false, error: `Tenant not found: ${tenantId}` };

  // Prevent exact keyword duplicates (case-insensitive)
  const existing = (user.seoClusters ?? []).find(
    (c: any) => c.keyword?.toLowerCase() === keyword.toLowerCase()
  );
  if (existing) {
    return { ok: false, duplicate: true, error: `"${keyword}" is already in your queue (status: ${existing.status})` };
  }

  // Build the new cluster sub-document
  const newClusterId = new mongoose.Types.ObjectId();
  const now          = new Date();

  const newCluster: Record<string, unknown> = {
    _id:      newClusterId,
    keyword:  keyword.trim(),
    category,
    location: location?.trim() || '',
    status:   'queued',
    impressions: 0,
    clicks:      0,
    pushedAt:    now,
    // audit fields — not in schema but stored as Mixed
    queuedBy:  source,
    queuedAt:  now.toISOString(),
  };

  await User.updateOne(
    { _id: user._id },
    { $push: { seoClusters: newCluster } }
  );

  // ── SSE: notify any live dashboard subscribers immediately ───────────────
  publish(String(user._id), {
    type:    'queue_update',
    payload: { clusterId: String(newClusterId), keyword: keyword.trim(), status: 'queued', source },
  });

  // ── State-driven autopilot: check if we should run after this queue ───────
  // Fire-and-forget — never blocks the response
  triggerAutopilotIfNeeded(String(user._id)).catch(() => {});

  return { ok: true, clusterId: String(newClusterId) };
}
