/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * app/api/admin/seo/campaigns/route.ts
 * GET  → list all campaigns (sorted newest first)
 * POST → create a new campaign
 */

import { NextResponse } from 'next/server';
import { cookies }      from 'next/headers';
import jwt              from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import SeoCampaign       from '@/models/SeoCampaign';

export const dynamic = 'force-dynamic';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev';

async function auth() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  if (!token) return false;
  try {
    const d = jwt.verify(token, JWT_SECRET) as Record<string, any>;
    return d.role === 'superadmin';
  } catch { return false; }
}

export async function GET() {
  if (!await auth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await connectToDatabase();
  const campaigns = await SeoCampaign.find().sort({ createdAt: -1 }).lean();
  return NextResponse.json({ ok: true, campaigns });
}

export async function POST(req: Request) {
  if (!await auth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await connectToDatabase();
  try {
    const body     = await req.json();
    const campaign = await SeoCampaign.create(body);
    return NextResponse.json({ ok: true, campaign }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
