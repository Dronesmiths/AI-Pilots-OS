/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * app/api/admin/seo/campaigns/[id]/status/route.ts
 * POST → update campaign status (activate / pause / cancel / complete)
 */

import { NextResponse } from 'next/server';
import { cookies }      from 'next/headers';
import jwt              from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import SeoCampaign       from '@/models/SeoCampaign';

export const dynamic = 'force-dynamic';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev';

const VALID = new Set(['draft','active','paused','completed','failed','cancelled']);

export async function POST(req: Request, { params }: any) {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const d = jwt.verify(token, JWT_SECRET) as Record<string, any>;
    if (d.role !== 'superadmin') throw new Error();
  } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }

  const { status } = await req.json();
  if (!VALID.has(status)) {
    return NextResponse.json({ error: `Invalid status. Use: ${[...VALID].join(', ')}` }, { status: 400 });
  }

  await connectToDatabase();
  const campaign = await SeoCampaign.findByIdAndUpdate(
    params.id, { status }, { new: true }
  ).lean();
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  return NextResponse.json({ ok: true, campaign });
}
