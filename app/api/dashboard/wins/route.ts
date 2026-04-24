import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import connectToDatabase             from '@/lib/mongodb';
import KeywordWin                    from '@/models/client/KeywordWin';

export const dynamic = 'force-dynamic';

async function getDomain(req: NextRequest): Promise<string | null> {
  const cs = await cookies();
  return req.nextUrl.searchParams.get('domain') ?? cs.get('portal_domain')?.value ?? null;
}

export async function GET(req: NextRequest) {
  const domain = await getDomain(req);
  await connectToDatabase();

  if (!domain) return NextResponse.json({ ok: true, wins: [] });

  const wins = await KeywordWin.find({ domain })
    .sort({ weekStart: -1, impressionsLift: -1 })
    .limit(6)
    .lean() as any[];

  return NextResponse.json({
    ok: true,
    wins: wins.map(w => ({
      id:             String(w._id),
      keyword:        w.keyword,
      oldPosition:    w.oldPosition,
      newPosition:    w.newPosition,
      impressionsLift:w.impressionsLift,
      clicksLift:     w.clicksLift,
      weekStart:      w.weekStart,
      notes:          w.notes,
    })),
  });
}

/** POST /api/dashboard/wins — seed a win (called by drone system or GSC sync) */
export async function POST(req: NextRequest) {
  await connectToDatabase();
  const body = await req.json().catch(() => ({})) as { domain: string; keyword: string; oldPosition: number; newPosition: number; impressionsLift?: number; clicksLift?: number; weekStart?: string; notes?: string; source?: string };

  if (!body.domain || !body.keyword) return NextResponse.json({ error: 'domain and keyword required' }, { status: 400 });
  if (body.newPosition >= body.oldPosition) return NextResponse.json({ error: 'newPosition must be better (lower) than oldPosition' }, { status: 400 });

  const win = await KeywordWin.create({
    domain:          body.domain.toLowerCase().trim(),
    keyword:         body.keyword,
    oldPosition:     body.oldPosition,
    newPosition:     body.newPosition,
    impressionsLift: body.impressionsLift ?? 0,
    clicksLift:      body.clicksLift ?? 0,
    weekStart:       body.weekStart ? new Date(body.weekStart) : new Date(),
    notes:           body.notes ?? '',
    source:          body.source ?? 'gsc',
  });

  return NextResponse.json({ ok: true, win });
}
