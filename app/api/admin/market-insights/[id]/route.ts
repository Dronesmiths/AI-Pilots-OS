import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import MarketInsight from '@/models/MarketInsight';
import User from '@/models/User';
import { triggerSeoExpansion } from '@/lib/seo-engine';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    
    // Security: Only SuperAdmins can approve autonomous operations
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;

    if (!token) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    
    const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev';
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as Record<string, any>;
      if (decoded.role !== 'superadmin') throw new Error('Insufficient privileges');
    } catch {
      return NextResponse.json({ error: 'Invalid master signature.' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body; // 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action payload.' }, { status: 400 });
    }

    await connectToDatabase();
    const insight = await MarketInsight.findById(params.id);
    if (!insight) return NextResponse.json({ error: 'Insight Ledger mapping not found.' }, { status: 404 });

    insight.status = action === 'approve' ? 'approved' : 'rejected';
    await insight.save();

    console.log(`[GSC INSIGHTS] Admin ${action}d the market logic for keyword: ${insight.keyword}`);

    if (action === 'approve') {
      const user = await User.findById(insight.user).lean();
      if (user) {
        console.log(`[GSC INSIGHTS] Triggering SEO Expansion Pipeline for approved payload...`);
        const targetDomain = user.targetDomain || `${user.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
        
        triggerSeoExpansion({
          clientId: user._id.toString(),
          repoUrl: user.repoUrl || 'https://github.com/Dronesmiths/factory-base',
          gscSiteUrl: `sc-domain:${targetDomain}`,
          domain: targetDomain
        }).catch(e => console.error("Ignition routing failed on approved payload:", e));
      }
    }

    return NextResponse.json({ success: true, status: insight.status });
  } catch (error: any) {
    console.error("[GSC INSIGHTS] Error patching autonomous recommendation:", error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
