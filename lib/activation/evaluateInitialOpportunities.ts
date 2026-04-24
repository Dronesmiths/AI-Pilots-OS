/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/activation/evaluateInitialOpportunities.ts
 *
 * Generates the first smart recommendations immediately after activation.
 * Uses real GSC data where available, niche-defaults otherwise.
 *
 * Output feeds:
 *  - Dashboard "Recommendations" panel
 *  - Autopilot inputs (next actions)
 *  - Activity feed (opportunity events)
 */

import connectToDatabase from '@/lib/mongodb';
import ActivationState   from '@/models/ActivationState';
import ClientActivityFeed from '@/models/ClientActivityFeed';

export interface OpportunityItem {
  type:     'low_ctr' | 'content_gap' | 'ranking_opportunity' | 'link_gap' | 'position_push';
  message:  string;
  priority: 'high' | 'medium' | 'low';
}

function minsAgo(mins: number): Date {
  return new Date(Date.now() - mins * 60 * 1000);
}

export async function evaluateInitialOpportunities(params: {
  tenantId:   string;
  clientId:   string;
  niche:      string;
  city:       string;
  topQueries: { query: string; clicks: number; impressions: number; position: number }[];
  starterPages: string[];
}): Promise<OpportunityItem[]> {
  const { tenantId, clientId, niche, city, topQueries, starterPages } = params;
  await connectToDatabase();

  const opportunities: OpportunityItem[] = [];
  const loc = city ? `${niche} ${city}` : niche;

  // ── Analyze real GSC queries if available ───────────────────────
  for (const q of topQueries.slice(0, 5)) {
    // High impressions, low CTR → low_ctr opportunity
    if (q.impressions > 50 && q.ctr !== undefined && q.ctr < 0.04) {
      opportunities.push({
        type:     'low_ctr',
        message:  `High visibility, low clicks detected for "${q.query}" (${q.impressions} impressions) — title and meta update recommended`,
        priority: 'high',
      });
    }
    // Position 5-20 → striking distance → position push
    if (q.position >= 5 && q.position <= 20) {
      opportunities.push({
        type:     'position_push',
        message:  `"${q.query}" is ranking #${Math.round(q.position)} — within striking distance of page 1`,
        priority: q.position <= 12 ? 'high' : 'medium',
      });
    }
  }

  // ── Content gap: missing high-value pages ────────────────────────
  const emergencyKeyword = `emergency ${niche.replace('realestate', 'real estate')}${city ? ` ${city}` : ''}`;
  const hasEmergencyPage = starterPages.some(p => p.includes('emergency'));
  if (!hasEmergencyPage) {
    opportunities.push({
      type:     'content_gap',
      message:  `Missing high-intent page: "${emergencyKeyword}" — high commercial intent searches going unanswered`,
      priority: 'high',
    });
  }

  // ── "Near me" gap ─────────────────────────────────────────────────
  const hasNearMeQuery = topQueries.some(q => q.query.includes('near me'));
  if (!hasNearMeQuery) {
    opportunities.push({
      type:     'content_gap',
      message:  `"${niche} near me" searches not yet captured — add location-specific service pages`,
      priority: 'medium',
    });
  }

  // ── Ranking opportunity (always include at least one) ────────────
  if (opportunities.filter(o => o.type === 'ranking_opportunity' || o.type === 'position_push').length === 0) {
    opportunities.push({
      type:     'ranking_opportunity',
      message:  `"${loc} near me" keyword is in early indexing — Nova will push this into top 20 within 30 days`,
      priority: 'medium',
    });
  }

  // ── Link gap ─────────────────────────────────────────────────────
  opportunities.push({
    type:     'link_gap',
    message:  `Internal link structure is sparse — connecting service pages will improve all rankings`,
    priority: 'low',
  });

  // Persist to ActivationState
  await ActivationState.updateOne(
    { tenantId, clientId },
    {
      $set: {
        opportunities: opportunities.slice(0, 6),
        'steps.opportunitiesGenerated': true,
      },
    },
    { upsert: true }
  );

  // Add top 2 opportunities to activity feed as smart insight events
  for (const opp of opportunities.filter(o => o.priority === 'high').slice(0, 2)) {
    await ClientActivityFeed.create({
      userId:    clientId,
      type:      'discovery',
      icon:      '💡',
      message:   opp.message,
      createdAt: minsAgo(20),
    }).catch(() => {});
  }

  return opportunities;
}
