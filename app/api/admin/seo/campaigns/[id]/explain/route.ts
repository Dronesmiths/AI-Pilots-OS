/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * app/api/admin/seo/campaigns/[id]/explain/route.ts
 * GET → consolidated intelligence surface for a campaign
 *       returns: campaign summary, bandit snapshot, recent runs, strategy memory
 */

import { NextResponse } from 'next/server';
import { cookies }      from 'next/headers';
import jwt              from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import SeoCampaign        from '@/models/SeoCampaign';
import SeoCampaignRun     from '@/models/SeoCampaignRun';
import SeoStrategyMemory  from '@/models/SeoStrategyMemory';
import { getBanditSnapshot } from '@/lib/seo/getBanditSnapshot';

export const dynamic = 'force-dynamic';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev';

export async function GET(_: Request, { params }: any) {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const d = jwt.verify(token, JWT_SECRET) as Record<string, any>;
    if (d.role !== 'superadmin') throw new Error();
  } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }

  await connectToDatabase();

  const campaign = await SeoCampaign.findById(params.id).lean() as any;
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [runs, memory, bandit] = await Promise.all([
    SeoCampaignRun.find({ campaignId: params.id }).sort({ createdAt: -1 }).limit(10).lean(),
    SeoStrategyMemory.find({ campaignId: params.id }).sort({ createdAt: -1 }).limit(20).lean(),
    getBanditSnapshot({ scopeType: 'campaign', scopeId: params.id }),
  ]);

  return NextResponse.json({
    ok: true,
    data: {
      campaign: {
        id:                    String(campaign._id),
        name:                  campaign.name,
        status:                campaign.status,
        strategyType:          campaign.strategy?.type,
        primaryAction:         campaign.strategy?.primaryAction,
        lastOutcome:           campaign.progress?.lastOutcome ?? '',
        lastRecommendedAction: campaign.memory?.lastRecommendedAction ?? '',
        lastReason:            campaign.memory?.lastReason ?? '',
        lastTopTargets:        campaign.memory?.lastTopTargets ?? [],
      },
      bandit,
      recentRuns: runs,
      recentMemory: memory,
    },
  });
}
