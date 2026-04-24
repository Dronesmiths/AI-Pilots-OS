import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import connectToDatabase             from '@/lib/mongodb';
import DashboardClientState          from '@/models/client/DashboardClientState';
import AnomalyResponseBandit         from '@/models/governance/AnomalyResponseBandit';
import BanditArmPull                 from '@/models/governance/BanditArmPull';

export const dynamic = 'force-dynamic';

async function getDomain(req: NextRequest): Promise<string | null> {
  const cs = await cookies();
  return req.nextUrl.searchParams.get('domain') ?? cs.get('portal_domain')?.value ?? null;
}

export async function GET(req: NextRequest) {
  const domain = await getDomain(req);
  await connectToDatabase();

  const [clientState, allBandits, recentPulls] = await Promise.all([
    domain ? DashboardClientState.findOne({ domain }).lean() as any : null,
    AnomalyResponseBandit.find({ active: true }).select('lifecycle stats').lean() as any[],
    BanditArmPull.find({ selectedAt: { $gte: new Date(Date.now() - 7 * 86400_000) } })
      .select('outcome').lean() as any[],
  ]);

  // Try to read GSC/site metrics
  let gscMetrics: any = null;
  let pagesCreated = 0;
  try {
    const mongoose = (await import('mongoose')).default;
    if (domain && mongoose.modelNames().includes('SiteMetric')) {
      gscMetrics = await mongoose.model('SiteMetric').findOne({ domain }).sort({ weekStart: -1 }).lean();
    }
    for (const name of ['GeneratedPage','Article','SeoPage','ContentDraft']) {
      if (mongoose.modelNames().includes(name)) {
        pagesCreated = await mongoose.model(name).countDocuments({ createdAt: { $gte: new Date(Date.now() - 30 * 86400_000) } });
        if (pagesCreated > 0) break;
      }
    }
  } catch { /* not yet available */ }

  const liveBandits = allBandits.filter(b => b.lifecycle?.status === 'live').length;
  const harmfulPulls = recentPulls.filter(p => p.outcome?.harmful).length;
  const harmfulRate = recentPulls.length > 0 ? harmfulPulls / recentPulls.length : 0;

  return NextResponse.json({
    ok: true,
    domain:             domain ?? null,
    connected:          !!clientState?.onboarding?.gscConnected,
    onboardingStep:     clientState?.onboarding?.step ?? 1,
    onboardingComplete: (clientState?.onboarding?.step ?? 1) >= 4,
    autopilotOn:        clientState?.autopilotOn ?? true,
    autopilotMode:      clientState?.autopilotMode ?? 'balanced',
    metrics: {
      impressions:      gscMetrics?.impressions       ?? null,
      clicks:           gscMetrics?.clicks            ?? null,
      keywordsGrowing:  gscMetrics?.keywordsGrowing   ?? null,
      pagesCreated:     pagesCreated || null,
      impressionsDelta: gscMetrics?.impressionsDelta  ?? null,
      clicksDelta:      gscMetrics?.clicksDelta       ?? null,
      dataAvailable:    !!gscMetrics,
    },
    systemStats: {
      totalDecisions: recentPulls.length,
      liveBandits,
      activeBandits: allBandits.length,
      harmfulRate: Math.round(harmfulRate * 100),
    },
  });
}
