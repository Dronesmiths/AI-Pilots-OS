/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * app/api/admin/seo/campaigns/[id]/route.ts
 * GET → read one campaign
 */

import { NextResponse } from 'next/server';
import { cookies }      from 'next/headers';
import jwt              from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import SeoCampaign       from '@/models/SeoCampaign';
import SeoCampaignRun    from '@/models/SeoCampaignRun';

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
  const campaign = await SeoCampaign.findById(params.id).lean();
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Include last 5 runs for the drawer
  const runs = await SeoCampaignRun.find({ campaignId: params.id })
    .sort({ createdAt: -1 }).limit(5).lean();

  return NextResponse.json({ ok: true, campaign, runs });
}
