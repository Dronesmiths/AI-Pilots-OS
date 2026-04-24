/**
 * lib/queue/eventBus.ts
 *
 * In-memory pub/sub for SSE queue updates.
 *
 * ⚠️ VERCEL SERVERLESS LIMITATION:
 *   This event bus lives in process memory. On Vercel, each edge invocation
 *   may route to a different serverless instance, so SSE subscribers on one
 *   instance won't receive events emitted by another.
 *
 *   Practical behaviour:
 *   - Works reliably in local dev
 *   - Works when SSE client and publish action hit the same instance (common
 *     in practice because requests are often pinned — but not guaranteed)
 *   - The SSE hook (useQueueStream) includes fallback polling so the UI
 *     always converges even if an event is missed
 *
 *   Production upgrade path: replace publish() with Redis Pub/Sub
 *   and subscribe() with a Redis subscriber per request.
 */

type Listener = (data: unknown) => void;

const listeners = new Map<string, Set<Listener>>();

/** Register a listener for a tenant. Returns an unsubscribe fn. */
export function subscribe(tenantId: string, fn: Listener): () => void {
  if (!listeners.has(tenantId)) listeners.set(tenantId, new Set());
  listeners.get(tenantId)!.add(fn);
  return () => listeners.get(tenantId)?.delete(fn);
}

/** Emit an event to all subscribers for a tenant. Fire-and-forget. */
export function publish(tenantId: string, payload: unknown): void {
  const subs = listeners.get(tenantId);
  if (!subs || subs.size === 0) return;
  for (const fn of subs) {
    try { fn(payload); } catch { /* never let a bad subscriber crash the publisher */ }
  }
}
