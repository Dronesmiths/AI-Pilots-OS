/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * app/api/admin/seo/activity/route.ts
 *
 * GET /api/admin/seo/activity[?userId=<id>]
 *
 * Returns real SeoActivityEvent documents — not derived from clusters.
 * This is the canonical Engine Action Feed for the dashboard.
 */

import { NextResponse } from 'next/server';
import { cookies }      from 'next/headers';
import jwt              from 'jsonwebtoken';
import { Types }        from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import SeoActivityEvent  from '@/models/SeoActivityEvent';

export const dynamic = 'force-dynamic';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev';

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, any>;
    if (decoded.role !== 'superadmin') throw new Error();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    const query: any = {};
    if (userId && Types.ObjectId.isValid(userId)) query.userId = new Types.ObjectId(userId);

    const events = await SeoActivityEvent.find(query)
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    return NextResponse.json({ ok: true, events });

  } catch (err: any) {
    console.error('[seo/activity]', err.message);
    return NextResponse.json({ error: 'Failed to load activity' }, { status: 500 });
  }
}
