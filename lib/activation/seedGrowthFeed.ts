/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/activation/seedGrowthFeed.ts
 *
 * Creates 8-10 pre-built activity events in ClientActivityFeed.
 * Events are timestamped in the past (2-480 minutes ago)
 * so the dashboard loads already feeling active.
 *
 * Critical: never show an empty feed on first login.
 */

import connectToDatabase  from '@/lib/mongodb';
import ClientActivityFeed from '@/models/ClientActivityFeed';
import ActivationState    from '@/models/ActivationState';

function minsAgo(mins: number): Date {
  return new Date(Date.now() - mins * 60 * 1000);
}

interface FeedEvent {
  icon:       string;
  type:       string;
  message:    string;
  minutesAgo: number;
}

function buildFeedEvents(params: {
  niche:       string;
  city:        string;
  brandName:   string;
  pagesCount:  number;
  topicsCount: number;
  topQuery?:   string;
}): FeedEvent[] {
  const { niche, city, brandName, pagesCount, topicsCount, topQuery } = params;
  const loc  = city ? `${niche} ${city}` : niche;
  const q    = topQuery ?? `${loc} near me`;

  return [
    { icon: '🚀', type: 'install',   message: `SEO engine deployed and connected for ${brandName}`,     minutesAgo: 2   },
    { icon: '🔍', type: 'discovery', message: `Google Search Console data synced — initial scan complete`, minutesAgo: 5   },
    { icon: '📄', type: 'publish',   message: `${pagesCount} service pages detected and added to tracking`, minutesAgo: 8   },
    { icon: '🧠', type: 'discovery', message: `${topicsCount} keyword clusters generated from niche + location`, minutesAgo: 12  },
    { icon: '📈', type: 'ranking',   message: `Ranking opportunity identified: "${q}"`,                  minutesAgo: 18  },
    { icon: '🔗', type: 'link',      message: `Internal linking structure initialized across site`,        minutesAgo: 28  },
    { icon: '📊', type: 'optimize',  message: `Baseline performance metrics established`,                 minutesAgo: 45  },
    { icon: '🤖', type: 'autopilot', message: `Autopilot monitoring activated — checking your rankings 24/7`, minutesAgo: 62  },
    { icon: '🎯', type: 'ranking',   message: `3 keywords flagged as close to page 1 — targeting initiated`, minutesAgo: 90  },
    { icon: '✅', type: 'optimize',  message: `Site health check complete — engine ready for growth`,     minutesAgo: 135 },
  ];
}

export async function seedGrowthFeed(params: {
  tenantId:    string;
  clientId:    string;
  niche:       string;
  city:        string;
  brandName:   string;
  pagesCount:  number;
  topicsCount: number;
  topQuery?:   string;
}): Promise<void> {
  const { tenantId, clientId, ...rest } = params;
  await connectToDatabase();

  // Idempotent: don't double-seed if activation ran before
  const existingCount = await ClientActivityFeed.countDocuments({ userId: clientId }).catch(() => 0);
  if (existingCount >= 5) {
    // Already seeded
    await ActivationState.updateOne({ tenantId, clientId }, { $set: { 'steps.growthFeedCreated': true } });
    return;
  }

  const events = buildFeedEvents(rest);

  await ClientActivityFeed.insertMany(
    events.map(ev => ({
      userId:    clientId,
      type:      ev.type,
      icon:      ev.icon,
      message:   ev.message,
      createdAt: minsAgo(ev.minutesAgo),
    }))
  );

  await ActivationState.updateOne(
    { tenantId, clientId },
    { $set: { 'steps.growthFeedCreated': true } },
    { upsert: true }
  );
}
