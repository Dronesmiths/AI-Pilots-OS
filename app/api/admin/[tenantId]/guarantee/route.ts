/**
 * app/api/admin/[tenantId]/guarantee/route.ts
 *
 * GET  → get active guarantee + progress history
 * POST → create / activate guarantee (with eligibility check)
 * PUT  → trigger daily evaluation manually
 */
import { NextRequest, NextResponse }  from 'next/server';
import connectToDatabase               from '@/lib/mongodb';
import { NovaROIGuarantee, NovaGuaranteeProgress, GuaranteeType } from '@/models/guarantee/NovaROIGuarantee';
import { checkGuaranteeEligibility, evaluateGuarantee } from '@/lib/guarantee/evaluateGuarantee';
import { NovaBoardMemory }             from '@/models/boardroom/NovaBoardMemory';

export async function GET(req: NextRequest, { params }: { params: { tenantId: string } }) {
  await connectToDatabase();
  const { tenantId } = params;

  const guarantee = await NovaROIGuarantee.findOne({ tenantId, status: { $in: ['active','extended','met'] } })
    .sort({ createdAt: -1 }).lean();

  if (!guarantee) return NextResponse.json({ guarantee: null });

  const progress = await NovaGuaranteeProgress.find({ guaranteeKey: (guarantee as any).guaranteeKey })
    .sort({ date: -1 }).limit(90).lean();

  return NextResponse.json({ guarantee, progress }, { headers: { 'Cache-Control':'no-store' } });
}

export async function POST(req: NextRequest, { params }: { params: { tenantId: string } }) {
  await connectToDatabase();
  const { tenantId } = params;
  const body = await req.json().catch(() => ({}));
  const { guaranteeType = 'traffic', targetPct = 0.25, timeframeDays = 60, failureResponse = 'extend', baselineValue } = body;

  // Use board memory average as baseline if not provided
  let baseline = baselineValue;
  if (!baseline) {
    const memory = await NovaBoardMemory.find({ tenantId, measured: true }).sort({ createdAt: 1 }).limit(14).lean();
    baseline = memory.length
      ? memory.reduce((s: number, m: any) => s + (m.outcomeScore ?? 0), 0) / memory.length * 1000
      : 500; // fallback baseline
  }

  // Eligibility check
  const { eligible, notes } = await checkGuaranteeEligibility(tenantId, baseline, guaranteeType as GuaranteeType);
  if (!eligible) {
    return NextResponse.json({ ok: false, eligible: false, notes }, { status: 422 });
  }

  const now      = new Date();
  const endsAt   = new Date(now); endsAt.setDate(now.getDate() + timeframeDays);
  const guaranteeKey = `${tenantId}::${guaranteeType}::${Date.now()}`;

  const guarantee = await NovaROIGuarantee.create({
    guaranteeKey, tenantId,
    guaranteeType, targetPct,
    baselineValue: baseline,
    timeframeDays, startsAt: now, endsAt,
    failureResponse, status: 'active',
    isEligible: true,
  });

  return NextResponse.json({ ok: true, guarantee, eligible: true });
}

export async function PUT(req: NextRequest, { params }: { params: { tenantId: string } }) {
  await connectToDatabase();
  const { tenantId } = params;

  const guarantee = await NovaROIGuarantee.findOne({ tenantId, status: { $in: ['active','extended'] } }).lean();
  if (!guarantee) return NextResponse.json({ ok: false, error: 'No active guarantee' }, { status: 404 });

  await evaluateGuarantee((guarantee as any).guaranteeKey);
  const updated = await NovaROIGuarantee.findOne({ guaranteeKey: (guarantee as any).guaranteeKey }).lean();

  return NextResponse.json({ ok: true, guarantee: updated });
}
