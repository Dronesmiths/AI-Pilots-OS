/**
 * app/api/admin/onboarding/route.ts
 *
 * POST — run the full onboarding flow for a new tenant.
 * GET  — list all tenants with their onboarded status.
 *
 * POST body:
 *   { tenantId, name, domain?, industry?, plan, goal, operatorId? }
 *
 * POST response:
 *   { ok, tenantId, portfolioKey, warRoomUrl, settingsUrl, steps }
 *
 * Safety:
 *   - tenantId must be a clean slug: lowercase alphanum + hyphens only
 *   - duplicate tenantId is idempotent (re-runs use $setOnInsert)
 *   - domain defaults to [tenantId].novaintel.app if not provided
 */
import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase              from '@/lib/mongodb';
import Tenant                         from '@/models/Tenant';
import { runOnboardingFlow }          from '@/lib/onboarding/runOnboardingFlow';

// ── Slug validator ─────────────────────────────────────────────────────────────
function isValidSlug(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(id);
}

// ── GET — tenant registry ─────────────────────────────────────────────────────
export async function GET() {
  await connectToDatabase();
  const tenants = await Tenant.find({}).sort({ createdAt: -1 }).lean();
  return NextResponse.json({ tenants }, { headers: { 'Cache-Control': 'no-store' } });
}

// ── POST — run onboarding ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  await connectToDatabase();

  const body = await req.json().catch(() => ({}));
  const {
    tenantId,
    name,
    domain,
    industry,
    plan    = 'starter',
    goal    = 'grow_traffic',
    operatorId = 'brian',
  } = body;

  // Validate
  if (!tenantId) return NextResponse.json({ ok:false, error:'tenantId is required' }, { status:400 });
  if (!name)     return NextResponse.json({ ok:false, error:'name is required' },     { status:400 });
  if (!isValidSlug(tenantId)) {
    return NextResponse.json({ ok:false, error:'tenantId must be lowercase alphanumeric with hyphens only (2–50 chars)' }, { status:400 });
  }
  if (!['starter','growth','pro'].includes(plan)) {
    return NextResponse.json({ ok:false, error:'plan must be starter | growth | pro' }, { status:400 });
  }
  if (!['grow_traffic','increase_conversions','stabilize','experiment'].includes(goal)) {
    return NextResponse.json({ ok:false, error:'invalid goal value' }, { status:400 });
  }

  try {
    const result = await runOnboardingFlow({
      tenantId,
      name,
      domain:      domain ?? `${tenantId}.novaintel.app`,
      industry:    industry ?? '',
      plan,
      goal,
      operatorId,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
