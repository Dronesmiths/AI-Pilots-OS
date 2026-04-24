/**
 * lib/tenant/enforceScope.ts
 *
 * Injects workspaceId into every DB query to prevent cross-client data bleed.
 * All cross-site operations MUST use this before querying tenant-scoped models.
 *
 * HARD RULE:
 *   NEVER: SeoGoal.find({})
 *   ALWAYS: SeoGoal.find(enforceScope({}, ctx))
 *
 * Usage:
 *   const ctx = { workspaceId: workspace._id.toString() };
 *   const goals = await SeoGoal.find(enforceScope({ status: 'active' }, ctx));
 */

export interface TenantContext {
  workspaceId: string;
  userId?:     string;
  siteId?:     string;
}

export function enforceScope<T extends Record<string, unknown>>(
  query: T,
  ctx: TenantContext
): T & { workspaceId: string } {
  if (!ctx?.workspaceId) {
    throw new Error('Missing workspace context — enforceScope requires workspaceId');
  }
  return { ...query, workspaceId: ctx.workspaceId };
}

/** Adds both workspaceId AND userId for per-user scoping */
export function enforceScopeFull<T extends Record<string, unknown>>(
  query: T,
  ctx: TenantContext & { userId: string }
): T & { workspaceId: string; userId: string } {
  if (!ctx?.workspaceId || !ctx?.userId) {
    throw new Error('Missing workspace or user context');
  }
  return { ...query, workspaceId: ctx.workspaceId, userId: ctx.userId };
}
