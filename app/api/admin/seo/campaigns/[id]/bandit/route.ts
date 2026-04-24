/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * app/api/admin/seo/campaigns/[id]/bandit/route.ts
 * GET → bandit arm snapshot for one campaign
 */

import { NextResponse } from 'next/server';
import { cookies }      from 'next/headers';
import jwt              from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
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
  const state = await getBanditSnapshot({ scopeType: 'campaign', scopeId: params.id });
  return NextResponse.json({ ok: true, state });
}
