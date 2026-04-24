/**
 * lib/tenancy/getTenantContext.ts
 *
 * Returns the resolved tenant context for the current request.
 *
 * Priority:
 *   1. If operatorId is in session and has a NovaOperatorScope → use it
 *   2. Fallback: hard-coded owner context for Brian (during bootstrap)
 *
 * Used in every route handler before any DB query:
 *   const ctx = await getTenantContext(req, tenantId);
 *   enforceTenantAccess(ctx, tenantId, portfolioKey?);
 *
 * TenantContext shape:
 *   operatorId            — who is acting
 *   role                  — their Nova operator role
 *   tenantId              — the resolved tenant they should query
 *   allowedPortfolioKeys  — empty = access all portfolios in this tenant
 *   isPlatformOwner       — can see/act across all tenants
 *
 * Note: During Phase 1 of multi-tenant migration, getTenantContext defaults
 * to the platform owner context (Brian) if no session/scope found. This keeps
 * all existing routes working while scoped operators are provisioned.
 */
import connectToDatabase          from '@/lib/mongodb';
import { NovaOperatorScope }      from '@/models/tenancy/NovaOperatorScope';
import type { NovaOperatorRole }  from '@/lib/auth/permissions';

export interface TenantContext {
  operatorId:           string;
  role:                 NovaOperatorRole;
  tenantId:             string;
  allowedPortfolioKeys: string[];
  isPlatformOwner:      boolean;
}

// ─── PLATFORM OWNER Bootstrap Context ────────────────────────────────────────
// Used until a real session / JWT token is in place.
// In production: replace with session.user.id and look up NovaOperatorScope.
const BOOTSTRAP_OWNER: TenantContext = {
  operatorId:           'brian',
  role:                 'owner',
  tenantId:             'platform',
  allowedPortfolioKeys: [],
  isPlatformOwner:      true,
};

export async function getTenantContext(
  _req?: Request,
  requestedTenantId?: string
): Promise<TenantContext> {
  // TODO: Replace with real session extraction once auth is wired
  // const session = await getServerSession(authOptions);
  // const operatorId = session?.user?.id;

  const operatorId = 'brian'; // bootstrap

  if (!operatorId) return BOOTSTRAP_OWNER;

  try {
    await connectToDatabase();

    // Find the scope that matches the requested tenant, or the platform scope
    const query: Record<string,unknown> = { operatorId };
    if (requestedTenantId) query.tenantId = { $in: [requestedTenantId, 'platform'] };

    const scope = await NovaOperatorScope.findOne(query)
      .sort({ isPlatformOwner: -1 }) // prefer platform owner scope
      .lean();

    if (!scope) return BOOTSTRAP_OWNER;

    return {
      operatorId:           scope.operatorId,
      role:                 scope.role,
      tenantId:             requestedTenantId ?? scope.tenantId,
      allowedPortfolioKeys: scope.allowedPortfolioKeys,
      isPlatformOwner:      scope.isPlatformOwner,
    };
  } catch {
    // If DB not yet bootstrapped, fall through to owner default
    return BOOTSTRAP_OWNER;
  }
}

// ─── Scope + Tenant filter builder ───────────────────────────────────────────
/**
 * Builds a MongoDB filter object scoped to the tenant (and optionally portfolio).
 *
 * Always call this before querying tenant-owned models:
 *   const filter = withTenantFilter(ctx, { status: 'open' });
 *   const alerts = await NovaAnomalyEvent.find(filter).lean();
 *
 * If isPlatformOwner and no requestedTenantId: returns extra only (queries all tenants).
 * If tenantId is defined: always scopes to tenant.
 */
export function withTenantFilter(
  ctx: TenantContext,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  if (ctx.isPlatformOwner && ctx.tenantId === 'platform') {
    // Platform owner querying globally — no tenant filter
    return extra;
  }

  const filter: Record<string, unknown> = { tenantId: ctx.tenantId, ...extra };

  if (ctx.allowedPortfolioKeys.length > 0) {
    filter.portfolioKey = { $in: ctx.allowedPortfolioKeys };
  }

  return filter;
}
