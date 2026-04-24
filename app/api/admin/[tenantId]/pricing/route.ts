/**
 * app/api/admin/[tenantId]/pricing/route.ts
 *
 * GET → pricing profile + pending proposal + recent history
 * POST → run pricing engine for this tenant (compute new proposal)
 * PUT → approve or reject a pending proposal
 *
 * PUT body: { proposalKey, action: 'approve' | 'reject' }
 */
import { NextRequest, NextResponse }   from 'next/server';
import connectToDatabase                from '@/lib/mongodb';
import { NovaPricingProfile, NovaPricingProposal } from '@/models/pricing/NovaPricingProfile';
import { computePricingProposal, applyPricingProposal } from '@/lib/pricing/computePricingProposal';

export async function GET(req: NextRequest, { params }: { params: { tenantId: string } }) {
  await connectToDatabase();
  const { tenantId } = params;

  const [profile, pendingProposal, history] = await Promise.all([
    NovaPricingProfile.findOne({ tenantId }).lean(),
    NovaPricingProposal.findOne({ tenantId, status: 'pending' }).sort({ createdAt: -1 }).lean(),
    NovaPricingProposal.find({ tenantId }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  return NextResponse.json({ profile, pendingProposal, history }, { headers: { 'Cache-Control':'no-store' } });
}

export async function POST(req: NextRequest, { params }: { params: { tenantId: string } }) {
  await connectToDatabase();
  const { tenantId } = params;
  const proposal = await computePricingProposal(tenantId);
  return NextResponse.json({ ok: true, proposal });
}

export async function PUT(req: NextRequest, { params }: { params: { tenantId: string } }) {
  await connectToDatabase();
  const body = await req.json().catch(() => ({}));
  const { proposalKey, action } = body;

  if (!proposalKey || !action) return NextResponse.json({ ok:false, error:'proposalKey and action required' }, { status:400 });

  if (action === 'approve') {
    const applied = await applyPricingProposal(proposalKey);
    return NextResponse.json({ ok: applied });
  }

  if (action === 'reject') {
    await NovaPricingProposal.updateOne({ proposalKey }, { $set: { status:'rejected', rejectedAt: new Date() } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok:false, error:'Unknown action' }, { status:400 });
}
