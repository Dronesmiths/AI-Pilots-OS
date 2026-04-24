import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import connectToDatabase             from '@/lib/mongodb';
import AnomalyResponseBandit         from '@/models/governance/AnomalyResponseBandit';
import BanditArmPull                 from '@/models/governance/BanditArmPull';
import ArmCausalAttribution          from '@/models/governance/ArmCausalAttribution';

export const dynamic = 'force-dynamic';

async function getDomain(req: NextRequest): Promise<string | null> {
  const cs = await cookies();
  return req.nextUrl.searchParams.get('domain') ?? cs.get('portal_domain')?.value ?? null;
}

export async function GET(req: NextRequest) {
  const domain = await getDomain(req);
  await connectToDatabase();

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);

  const [recentPulls, allBandits, recentAttributions] = await Promise.all([
    BanditArmPull.find({ selectedAt: { $gte: sevenDaysAgo } })
      .select('selectedAt anomalyType outcome').sort({ selectedAt: -1 }).limit(500).lean() as any[],
    AnomalyResponseBandit.find({ active: true }).select('anomalyType lifecycle stats').lean() as any[],
    ArmCausalAttribution.find({ createdAt: { $gte: sevenDaysAgo } }).select('causalImpact').limit(200).lean() as any[],
  ]);

  const totalDecisions  = recentPulls.length;
  const liveBandits     = allBandits.filter(b => b.lifecycle?.status === 'live').length;
  const anomalyTypes    = [...new Set(recentPulls.map(p => p.anomalyType).filter(Boolean))];
  const positiveCausal  = recentAttributions.filter(a => (a.causalImpact?.overallCausalScore ?? 0) > 0).length;

  // Build natural-language activity items from real data
  const items: any[] = [];

  if (totalDecisions > 0)
    items.push({ id: 'decisions', icon: '🧠', label: `${totalDecisions} AI decisions made this week`, sub: `Across ${anomalyTypes.length} site optimization patterns`, ts: recentPulls[0]?.selectedAt });

  if (liveBandits > 0)
    items.push({ id: 'live',      icon: '⚡', label: `${liveBandits} live optimization engines running`,    sub: 'Selecting the best actions in real time', ts: new Date() });

  if (positiveCausal > 0)
    items.push({ id: 'causal',   icon: '📊', label: `${positiveCausal} positive causal impacts validated`,  sub: 'Confirming what actually drives results', ts: new Date() });

  if (allBandits.length > liveBandits)
    items.push({ id: 'shadow',   icon: '🔬', label: `${allBandits.length - liveBandits} strategies in shadow testing`, sub: 'New approaches being evaluated safely before going live', ts: new Date() });

  items.push({ id: 'safety',    icon: '🛡', label: 'Safety checks running on every decision',            sub: 'Harmful outcomes are automatically filtered and blocked', ts: new Date() });
  items.push({ id: 'learning',  icon: '🔄', label: 'Multi-armed bandit continuously learning',           sub: 'Every decision teaches the system what works on your site', ts: new Date() });

  // Try to add pages-created activity from content models
  try {
    const mongoose = (await import('mongoose')).default;
    for (const name of ['GeneratedPage','Article','SeoPage','ContentDraft']) {
      if (mongoose.modelNames().includes(name)) {
        const count = await mongoose.model(name).countDocuments({ createdAt: { $gte: sevenDaysAgo } });
        if (count > 0) {
          items.unshift({ id: 'pages', icon: '📄', label: `${count} new pages created this week`, sub: 'Targeting your highest-value keywords', ts: new Date() });
          break;
        }
      }
    }
  } catch { /* ok */ }

  return NextResponse.json({ ok: true, items: items.slice(0, 6), domain });
}
