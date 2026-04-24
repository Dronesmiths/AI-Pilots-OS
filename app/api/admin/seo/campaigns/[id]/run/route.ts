/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * app/api/admin/seo/campaigns/[id]/run/route.ts
 * POST → execute one campaign pass manually
 */

import { NextResponse } from 'next/server';
import { cookies }      from 'next/headers';
import jwt              from 'jsonwebtoken';
import { runCampaignPass } from '@/lib/seo/runCampaignPass';

export const dynamic = 'force-dynamic';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev';

export async function POST(_: Request, { params }: any) {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const d = jwt.verify(token, JWT_SECRET) as Record<string, any>;
    if (d.role !== 'superadmin') throw new Error();
  } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }

  try {
    const result = await runCampaignPass(params.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    const status = err.message?.includes('not active') ? 409 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
