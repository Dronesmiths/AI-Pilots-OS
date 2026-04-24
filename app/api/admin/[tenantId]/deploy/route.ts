import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(
  req: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  try {
    const { tenantId } = params;
    const body = await req.json();
    const { repoUrl, branch, domain, cloudflareProject } = body;

    if (!tenantId) return NextResponse.json({ error: 'Tenant ID required' }, { status: 400 });

    await connectToDatabase();

    const user = await User.findById(tenantId);
    if (!user) return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 });

    // Enforce safe updates
    user.githubRepo = repoUrl || user.githubRepo;
    user.targetDomain = domain || user.targetDomain;
    user.cloudflareAccountId = cloudflareProject || user.cloudflareAccountId;
    
    // Progress the onboarding chain
    if (user.onboardingConfig?.status !== 'engine_active') {
      if (!user.onboardingConfig) user.onboardingConfig = {};
      user.onboardingConfig.status = 'deployment_connected';
      user.onboardingConfig.updatedAt = new Date();
    }

    await user.save();

    return NextResponse.json({ success: true, status: 'deployment_connected' });

  } catch (err: any) {
    console.error("[DEPLOY CONNECT ERROR]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
