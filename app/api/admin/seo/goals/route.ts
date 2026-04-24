/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * app/api/admin/seo/goals/route.ts
 * GET  → list all goals (sorted newest first)
 * POST → create a new goal
 */

import { NextResponse } from 'next/server';
import { cookies }      from 'next/headers';
import jwt              from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import SeoGoal           from '@/models/SeoGoal';

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
  if (!(await auth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await connectToDatabase();
  const goals = await SeoGoal.find().sort({ status: 1, createdAt: -1 }).lean();
  return NextResponse.json({ ok: true, goals });
}

export async function POST(req: Request) {
  if (!(await auth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await connectToDatabase();
  try {
    const body = await req.json();
    const goal = await SeoGoal.create(body);
    return NextResponse.json({ ok: true, goal }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to create goal' }, { status: 400 });
  }
}
