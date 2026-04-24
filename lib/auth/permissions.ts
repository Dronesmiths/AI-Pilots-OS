/**
 * lib/auth/permissions.ts
 *
 * Role-based access control for agency multi-user workspaces.
 * Roles: owner > admin > operator > viewer
 *
 * Usage in routes:
 *   if (!canExecute(member.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
 */

export type WorkspaceRole = 'owner' | 'admin' | 'operator' | 'viewer';

const EXECUTE_ROLES  = new Set<WorkspaceRole>(['owner','admin','operator']);
const ADMIN_ROLES    = new Set<WorkspaceRole>(['owner','admin']);
const VIEW_ALL_ROLES = new Set<WorkspaceRole>(['owner','admin','operator','viewer']);

/** Can trigger commands, approve jobs, run optimizer */
export const canExecute = (role: string) => EXECUTE_ROLES.has(role as WorkspaceRole);

/** Can manage workspace settings, members, billing */
export const canAdmin   = (role: string) => ADMIN_ROLES.has(role as WorkspaceRole);

/** Can view all dashboard data */
export const canView    = (role: string) => VIEW_ALL_ROLES.has(role as WorkspaceRole);

/** Can promote policy proposals (admin+ only) */
export const canPromotePolicy = (role: string) => ADMIN_ROLES.has(role as WorkspaceRole);

/** Throws if role cannot execute — use in route handlers */
export function requireExecute(role: string): void {
  if (!canExecute(role)) throw Object.assign(new Error('Forbidden: insufficient role'), { status: 403 });
}

export function requireAdmin(role: string): void {
  if (!canAdmin(role)) throw Object.assign(new Error('Forbidden: admin role required'), { status: 403 });
}

// ─── Nova War Room Operator Roles ──────────────────────────────────────────────
// These coexist with the workspace role model above. Nova operator roles are
// used specifically for boardroom / war room / mitigation access control.
//
// Role hierarchy (most → least privileged):
//   owner              — unrestricted platform access
//   executive_operator — full operational control, no config changes
//   board_operator     — vote on resolutions, view all
//   risk_analyst       — read + acknowledge alerts
//   observer           — read-only view

export type NovaOperatorRole =
  | 'owner'
  | 'executive_operator'
  | 'board_operator'
  | 'risk_analyst'
  | 'observer';

export type NovaPermission =
  | 'war_room.view'
  | 'war_room.vote'
  | 'war_room.apply'
  | 'war_room.mitigate'
  | 'war_room.override'
  | 'war_room.configure'
  | 'war_room.acknowledge_alert';

export const novaRolePermissions: Record<NovaOperatorRole, NovaPermission[]> = {
  owner: [
    'war_room.view',
    'war_room.vote',
    'war_room.apply',
    'war_room.mitigate',
    'war_room.override',
    'war_room.configure',
    'war_room.acknowledge_alert',
  ],
  executive_operator: [
    'war_room.view',
    'war_room.vote',
    'war_room.apply',
    'war_room.mitigate',
    'war_room.acknowledge_alert',
  ],
  board_operator: [
    'war_room.view',
    'war_room.vote',
    'war_room.acknowledge_alert',
  ],
  risk_analyst: [
    'war_room.view',
    'war_room.acknowledge_alert',
  ],
  observer: [
    'war_room.view',
  ],
};

/** Check if role has a specific Nova permission */
export function hasNovaPermission(role: string, permission: NovaPermission): boolean {
  return (novaRolePermissions[role as NovaOperatorRole] ?? []).includes(permission);
}

/** Get all permissions for a Nova role */
export function getNovaPermissions(role: string): NovaPermission[] {
  return novaRolePermissions[role as NovaOperatorRole] ?? [];
}

