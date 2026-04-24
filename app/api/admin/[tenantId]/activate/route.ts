import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(
  req: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  try {
    const { tenantId } = params;
    if (!tenantId) return NextResponse.json({ error: 'Tenant ID required' }, { status: 400 });

    await connectToDatabase();

    const user = await User.findById(tenantId);
    if (!user) return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 });

    // Enforce Active Status
    user.seoAutomation = true;
    user.seoEngine = 'active';

    if (!user.onboardingConfig) user.onboardingConfig = {};
    user.onboardingConfig.status = 'engine_active';
    user.onboardingConfig.updatedAt = new Date();

    await user.save();

    return NextResponse.json({ success: true, status: 'engine_active' });

  } catch (err: any) {
    console.error("[ACTIVATE ENGINE ERROR]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
