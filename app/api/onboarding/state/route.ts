import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import connectToDatabase             from '@/lib/mongodb';
import DashboardClientState          from '@/models/client/DashboardClientState';

export const dynamic = 'force-dynamic';

async function getDomain(req: NextRequest): Promise<string | null> {
  const cs = await cookies();
  return req.nextUrl.searchParams.get('domain') ?? cs.get('portal_domain')?.value ?? null;
}

/** GET /api/onboarding/state — returns current onboarding state for the client */
export async function GET(req: NextRequest) {
  const domain = await getDomain(req);
  await connectToDatabase();

  const state = domain ? await DashboardClientState.findOne({ domain }).lean() as any : null;
  return NextResponse.json({ ok: true, state });
}

/**
 * POST /api/onboarding/state — advance onboarding step + save domain
 * Sets portal_domain cookie on first call (when domain is provided).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    domain?: string;
    step?: number;
    gscConnected?: boolean;
    engineLaunched?: boolean;
  };

  const cs = await cookies();
  const cookieDomain = cs.get('portal_domain')?.value;
  const domain = (body.domain ?? cookieDomain ?? '').toLowerCase().trim();

  if (!domain) return NextResponse.json({ error: 'domain required on first call' }, { status: 400 });

  await connectToDatabase();

  const update: any = { lastSeenAt: new Date() };
  if (body.step           !== undefined) update['onboarding.step']           = body.step;
  if (body.gscConnected   !== undefined) update['onboarding.gscConnected']   = body.gscConnected;
  if (body.engineLaunched !== undefined) update['onboarding.engineLaunched'] = body.engineLaunched;
  if ((body.step ?? 0) >= 4) update['onboarding.completedAt'] = new Date();

  const state = await DashboardClientState.findOneAndUpdate(
    { domain },
    { $set: update },
    { upsert: true, new: true }
  );

  // Build the response — set cookie if domain came from the body (first call)
  const res = NextResponse.json({ ok: true, state });
  if (body.domain) {
    res.cookies.set('portal_domain', domain, {
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 90, // 90 days
      sameSite: 'lax',
    });
  }

  return res;
}
