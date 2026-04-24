/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * app/api/admin/onboarding/session/route.ts
 * GET  ?clientId=  → load session
 * POST             → create/update session
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import jwt                           from 'jsonwebtoken';
import connectToDatabase             from '@/lib/mongodb';
import OnboardingSession             from '@/models/onboarding/OnboardingSession';

export const dynamic = 'force-dynamic';

async function requireAdmin(cs: any) {
  const token = cs.get('admin_token')?.value;
  if (!token) return false;
  try {
    const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev';
    jwt.verify(token, JWT_SECRET);
    return true;
  } catch { return false; }
}

export async function GET(req: NextRequest) {
  const cs = await cookies();
  if (!await requireAdmin(cs)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const clientId = req.nextUrl.searchParams.get('clientId');
  const tenantId = req.nextUrl.searchParams.get('tenantId') ?? 'default';
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });

  await connectToDatabase();
  const session = await OnboardingSession.findOne({ tenantId, clientId }).lean();
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  return NextResponse.json({ ok: true, session });
}

export async function POST(req: NextRequest) {
  const cs = await cookies();
  if (!await requireAdmin(cs)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { clientId, tenantId = 'default', business = {}, engineConfig = {} } = body;
  if (!clientId || !business.name) return NextResponse.json({ error: 'clientId and business.name required' }, { status: 400 });

  await connectToDatabase();

  const session = await OnboardingSession.findOneAndUpdate(
    { tenantId, clientId },
    {
      $set: {
        ...(business.name         && { 'business.name':         business.name }),
        ...(business.domain       && { 'business.domain':       business.domain }),
        ...(business.niche        && { 'business.niche':        business.niche }),
        ...(business.city         && { 'business.city':         business.city }),
        ...(business.state        && { 'business.state':        business.state }),
        ...(business.contactName  && { 'business.contactName':  business.contactName }),
        ...(business.contactEmail && { 'business.contactEmail': business.contactEmail }),
        ...(engineConfig.siteType    && { 'engineConfig.siteType':    engineConfig.siteType }),
        ...(engineConfig.publishMode && { 'engineConfig.publishMode': engineConfig.publishMode }),
        ...(engineConfig.targetGeo   && { 'engineConfig.targetGeo':   engineConfig.targetGeo }),
        ...(engineConfig.defaultServicePages?.length && { 'engineConfig.defaultServicePages': engineConfig.defaultServicePages }),
        ...(engineConfig.defaultBlogTopics?.length   && { 'engineConfig.defaultBlogTopics':   engineConfig.defaultBlogTopics }),
      },
      $setOnInsert: { 'install.status': 'draft' },
    },
    { upsert: true, new: true }
  );

  return NextResponse.json({ ok: true, session });
}
