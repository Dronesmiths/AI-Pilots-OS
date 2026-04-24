/**
 * lib/system/resolveEffectiveRuntimeState.ts
 *
 * Merges global and tenant runtime states into the effective policy ceiling.
 *
 * Rules:
 *   - degraded always wins (either global or tenant degraded = degraded effective)
 *   - otherwise: min(globalState, tenantState) by maturity order
 *
 * Maturity order: cold(0) < warming(1) < warm(2)
 * degraded is a special override, not on the maturity ladder.
 *
 * Examples:
 *   global=warm,    tenant=cold    → cold      (tenant is the bottleneck)
 *   global=warm,    tenant=warming → warming   (tenant is the bottleneck)
 *   global=warming, tenant=warm   → warming   (global caps it)
 *   global=degraded, tenant=warm  → degraded  (global override)
 *   global=warm,    tenant=degraded → degraded (tenant override)
 */

export type RuntimeState = 'cold' | 'warming' | 'warm' | 'degraded';

const MATURITY_ORDER: Record<Exclude<RuntimeState, 'degraded'>, number> = {
  cold:    0,
  warming: 1,
  warm:    2,
};

export function resolveEffectiveRuntimeState(
  globalState: RuntimeState,
  tenantState: RuntimeState,
): RuntimeState {
  // Degraded is an override — either level can trigger it
  if (globalState === 'degraded' || tenantState === 'degraded') {
    return 'degraded';
  }

  // Both are on the maturity ladder — take the less mature
  const gOrder = MATURITY_ORDER[globalState as keyof typeof MATURITY_ORDER] ?? 0;
  const tOrder = MATURITY_ORDER[tenantState as keyof typeof MATURITY_ORDER] ?? 0;
  return gOrder < tOrder ? globalState : tenantState;
}
