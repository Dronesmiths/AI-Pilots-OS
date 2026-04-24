/**
 * lib/tenancy/enforceTenantAccess.ts
 *
 * Two-part access check for every war room / boardroom API route:
 *   1. Capability  — does the role have the required permission?
 *   2. Scope       — is the operator allowed in this tenant + portfolio?
 *
 * Throws a 403-tagged error on failure (caught by route handlers).
 * Returns void on success.
 *
 * Usage in API routes:
 *   const ctx = await getTenantContext(req, params.tenantId);
 *   enforceTenantAccess(ctx, params.tenantId, 'war_room.vote', portfolioKey?);
 */
import type { TenantContext } from './getTenantContext';
import { hasNovaPermission }  from '@/lib/auth/permissions';
import type { NovaPermission } from '@/lib/auth/permissions';

export interface AccessDeniedError extends Error {
  status: 403;
  code:   'FORBIDDEN_CAPABILITY' | 'FORBIDDEN_TENANT' | 'FORBIDDEN_PORTFOLIO';
}

function deny(message: string, code: AccessDeniedError['code']): never {
  const err = Object.assign(new Error(message), { status: 403 as const, code });
  throw err;
}

export function enforceTenantAccess(
  ctx:              TenantContext,
  requestedTenantId: string,
  permission?:      NovaPermission,
  portfolioKey?:    string
): void {
  // ── 1. Capability check ──────────────────────────────────────────────────
  if (permission && !hasNovaPermission(ctx.role, permission)) {
    deny(`Role '${ctx.role}' does not have permission '${permission}'`, 'FORBIDDEN_CAPABILITY');
  }

  // ── 2. Tenant scope check ────────────────────────────────────────────────
  // Platform owners can access any tenant
  if (!ctx.isPlatformOwner && ctx.tenantId !== requestedTenantId) {
    deny(`Operator '${ctx.operatorId}' is not authorized for tenant '${requestedTenantId}'`, 'FORBIDDEN_TENANT');
  }

  // ── 3. Portfolio scope check ─────────────────────────────────────────────
  if (
    portfolioKey &&
    !ctx.isPlatformOwner &&
    ctx.allowedPortfolioKeys.length > 0 &&
    !ctx.allowedPortfolioKeys.includes(portfolioKey)
  ) {
    deny(`Operator '${ctx.operatorId}' is not authorized for portfolio '${portfolioKey}'`, 'FORBIDDEN_PORTFOLIO');
  }
}

// ─── NextResponse error helper ────────────────────────────────────────────────
// Use in route catch blocks:
//   } catch (err) { return handleAccessError(err); }
import { NextResponse } from 'next/server';

export function handleAccessError(err: unknown): NextResponse | null {
  if (err && typeof err === 'object' && (err as any).status === 403) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message, code: (err as any).code },
      { status: 403 }
    );
  }
  return null; // not an access error — let caller handle it
}
