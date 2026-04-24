/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * app/api/admin/seo/goals/[id]/route.ts
 * PATCH → update goal status or targets
 * DELETE → cancel goal
 */

import { NextResponse } from 'next/server';
import { cookies }      from 'next/headers';
import jwt              from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import SeoGoal           from '@/models/SeoGoal';

export const dynamic = 'force-dynamic';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev';

async function auth() {
  const s = await cookies();
  const token = s.get('admin_token')?.value;
  if (!token) return false;
  try {
    const d = jwt.verify(token, JWT_SECRET) as Record<string, any>;
    return d.role === 'superadmin';
  } catch { return false; }
}

export async function PATCH(req: Request, { params }: any) {
  if (!(await auth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await connectToDatabase();
  const body = await req.json();
  const goal = await SeoGoal.findByIdAndUpdate(params.id, { $set: body }, { new: true });
  if (!goal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, goal });
}

export async function DELETE(_: Request, { params }: any) {
  if (!(await auth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await connectToDatabase();
  await SeoGoal.findByIdAndUpdate(params.id, { status: 'cancelled' });
  return NextResponse.json({ ok: true });
}
