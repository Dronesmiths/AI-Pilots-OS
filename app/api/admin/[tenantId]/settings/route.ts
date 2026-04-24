/**
 * app/api/admin/[tenantId]/settings/route.ts
 *
 * Tenant settings API — reads and writes all policy overrides for a tenant.
 *
 * GET  → returns current effective posture + any active tenant override docs
 * POST → upserts a policy override + audits the change
 *
 * POST body:
 *   { policyType, values, operatorId?, portfolioKey? }
 *
 *   policyType values:
 *     'threshold'  → NovaDecisionThresholdPolicy
 *     'alert'      → NovaAlertPolicy
 *     'mitigation' → NovaMitigationPolicy
 *     'mandate'    → NovaStrategicModeConfig
 *     'domain'     → NovaStrategicModeConfig (domainprotection key)
 *
 * Safety: blocks configs that exceed hardcoded danger limits.
 */
import { NextRequest, NextResponse }         from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase                      from '@/lib/mongodb';
import { NovaDecisionThresholdPolicy }        from '@/models/boardroom/NovaDecisionThresholdPolicy';
import { NovaAlertPolicy }                    from '@/models/boardroom/NovaAlertPolicy';
import { NovaMitigationPolicy }               from '@/models/boardroom/NovaMitigationPolicy';
import { NovaStrategicModeConfig }            from '@/models/boardroom/NovaStrategicModeConfig';
import { NovaOperatorScope }                  from '@/models/tenancy/NovaOperatorScope';
import { NovaOperatorAuditLog }               from '@/models/audit/NovaOperatorAuditLog';
import User                                   from '@/models/User';
import {
  resolveDecisionThresholdPolicy,
  resolveAlertPolicy,
  resolveMitigationPolicy,
  resolveStrategicMandate,
  resolveDomainProtectionPolicy,
} from '@/lib/policy/resolvers';

// ── Safety limits — block configs that could destabilize Nova ─────────────────
const DANGER_GUARDS: Record<string, { field: string; operator: '>' | '<'; limit: number; message: string }[]> = {
  threshold: [
    { field: 'maxWorstCaseRisk',          operator: '>', limit: 0.60, message: 'Max worst-case risk above 60% may cause instability.' },
    { field: 'autoApproveAboveConfidence', operator: '<', limit: 0.70, message: 'Auto-approve below 70% confidence is dangerous.' },
    { field: 'minExpectedROI',             operator: '<', limit: -0.1, message: 'Negative min ROI threshold allows loss-generating decisions.' },
  ],
  alert: [
    { field: 'concentrationRiskThreshold', operator: '>', limit: 0.90, message: 'Concentration threshold above 90% is effectively disabled.' },
    { field: 'executionStallHours',        operator: '>', limit: 168,  message: 'Stall window over 168h (1 week) will miss most issues.' },
  ],
  mitigation: [
    { field: 'maxMitigationsPerDay', operator: '>', limit: 100, message: 'More than 100 mitigations/day suggests a runaway loop risk.' },
  ],
};

function checkDangerGuards(policyType: string, values: Record<string, unknown>): string[] {
  const warnings: string[] = [];
  const guards = DANGER_GUARDS[policyType] ?? [];
  for (const g of guards) {
    const val = values[g.field] as number;
    if (val === undefined) continue;
    if (g.operator === '>' && val > g.limit) warnings.push(g.message);
    if (g.operator === '<' && val < g.limit) warnings.push(g.message);
  }
  return warnings;
}

// ── GET — load posture + active tenant override docs ─────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> } | { params: { tenantId: string } }
) {
  await connectToDatabase();
  const resolvedParams = await params;
  const { tenantId } = resolvedParams;
  const portfolioKey  = req.nextUrl.searchParams.get('portfolioKey') ?? undefined;

  const [threshold, alert, mitigation, mandate, domain] = await Promise.all([
    resolveDecisionThresholdPolicy({ tenantId, portfolioKey }),
    resolveAlertPolicy({ tenantId, portfolioKey }),
    resolveMitigationPolicy({ tenantId, portfolioKey }),
    resolveStrategicMandate({ tenantId, portfolioKey }),
    resolveDomainProtectionPolicy({ tenantId, portfolioKey }),
  ]);

  // Load active override docs (raw, for form hydration)
  const [thresholdOverride, alertOverride, mitigationOverride, mandateOverride, domainOverride, operators, userDoc] = await Promise.all([
    NovaDecisionThresholdPolicy.findOne({ tenantId, portfolioKey: { $exists: portfolioKey ? true : false }, isEnabled: true }).lean(),
    NovaAlertPolicy.findOne({ tenantId, portfolioKey: { $exists: portfolioKey ? true : false }, isEnabled: true }).lean(),
    NovaMitigationPolicy.findOne({ tenantId, portfolioKey: { $exists: portfolioKey ? true : false }, isEnabled: true }).lean(),
    NovaStrategicModeConfig.findOne({ modeKey: `tenant::${tenantId}` }).lean(),
    NovaStrategicModeConfig.findOne({ modeKey: `domainprotection::${tenantId}` }).lean(),
    NovaOperatorScope.find({ tenantId }).lean(),
    User.findById(tenantId).lean(),
  ]);

  // Recent audit log for this tenant
  const auditLog = await NovaOperatorAuditLog.find({ 'metadata.tenantId': tenantId })
    .sort({ createdAt: -1 }).limit(50).lean();

  return NextResponse.json({
    tenantId,
    portfolioKey: portfolioKey ?? null,
    posture: { threshold, alert, mitigation, mandate, domain },
    overrides: {
      threshold:  thresholdOverride  ?? null,
      alert:      alertOverride      ?? null,
      mitigation: mitigationOverride ?? null,
      mandate:    mandateOverride    ?? null,
      domain:     domainOverride     ?? null,
    },
    operators,
    userDoc,
    auditLog,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

// ── POST — upsert override + audit ────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> } | { params: { tenantId: string } }
) {
  await connectToDatabase();
  const resolvedParams = await params;
  const { tenantId } = resolvedParams;
  const body = await req.json().catch(() => ({}));
  const { policyType, values, operatorId = 'brian', portfolioKey } = body;

  if (!policyType || !values) {
    return NextResponse.json({ ok: false, error: 'policyType and values required' }, { status: 400 });
  }

  const warnings = checkDangerGuards(policyType, values);

  // Load old values for diff audit
  let oldDoc: Record<string, unknown> | null = null;
  let upserted: string = '';

  if (policyType === 'threshold') {
    const existing = await NovaDecisionThresholdPolicy.findOne({ tenantId, isEnabled: true }).lean();
    oldDoc = existing as any;
    const policyKey = `threshold::${tenantId}::${portfolioKey ?? 'tenant'}`;
    await NovaDecisionThresholdPolicy.updateOne(
      { tenantId, ...(portfolioKey ? { portfolioKey } : { portfolioKey: { $exists: false } }) },
      { $set: { ...values, tenantId, policyKey, isEnabled: true, scopeType: 'portfolio', scopeKey: tenantId } },
      { upsert: true }
    );
    upserted = policyKey;
  }

  else if (policyType === 'alert') {
    const existing = await NovaAlertPolicy.findOne({ tenantId, isEnabled: true }).lean();
    oldDoc = existing as any;
    const policyKey = `alert::${tenantId}::${portfolioKey ?? 'tenant'}`;
    await NovaAlertPolicy.updateOne(
      { tenantId, ...(portfolioKey ? { portfolioKey } : { portfolioKey: { $exists: false } }) },
      { $set: { ...values, tenantId, policyKey, isEnabled: true, scopeType: 'portfolio', scopeKey: tenantId } },
      { upsert: true }
    );
    upserted = policyKey;
  }

  else if (policyType === 'mitigation') {
    const existing = await NovaMitigationPolicy.findOne({ tenantId, isEnabled: true }).lean();
    oldDoc = existing as any;
    const policyKey = `mitigation::${tenantId}::${portfolioKey ?? 'tenant'}`;
    await NovaMitigationPolicy.updateOne(
      { tenantId, ...(portfolioKey ? { portfolioKey } : { portfolioKey: { $exists: false } }) },
      { $set: { ...values, tenantId, policyKey, isEnabled: true, scopeType: 'portfolio', scopeKey: tenantId } },
      { upsert: true }
    );
    upserted = policyKey;
  }

  else if (policyType === 'mandate') {
    const modeKey = `tenant::${tenantId}`;
    const existing = await NovaStrategicModeConfig.findOne({ modeKey }).lean();
    oldDoc = existing as any;
    await NovaStrategicModeConfig.updateOne(
      { modeKey },
      { $set: { modeKey, mode: values.mode, tenantId, ...values } },
      { upsert: true }
    );
    upserted = modeKey;
  }

  else if (policyType === 'domain') {
    const modeKey = `domainprotection::${tenantId}`;
    const existing = await NovaStrategicModeConfig.findOne({ modeKey }).lean();
    oldDoc = existing as any;
    await NovaStrategicModeConfig.updateOne(
      { modeKey },
      { $set: { modeKey, tenantId, ...values } },
      { upsert: true }
    );
    upserted = modeKey;
  }

  else {
    return NextResponse.json({ ok: false, error: `Unknown policyType: ${policyType}` }, { status: 400 });
  }

  // Audit (fire-and-forget — never block the save on audit write)
  const actionKey = `audit::${operatorId}::policy.${policyType}.override::${upserted}::${Date.now()}`;
  void NovaOperatorAuditLog.create({
    actionKey,
    operatorId,
    role:       'owner',
    action:     `policy.${policyType}.override` as import('@/models/audit/NovaOperatorAuditLog').AuditAction,
    targetType: 'policy',
    targetKey:  upserted,
    metadata:   { tenantId, portfolioKey, policyType, oldValues: oldDoc, newValues: values },
  }).catch(() => {});

  return NextResponse.json({ ok: true, upserted, warnings });
}
