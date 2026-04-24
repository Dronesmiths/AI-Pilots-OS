/**
 * lib/dashboard/getFirstResults.ts
 *
 * Combines GSC truth + engine output + trust signals into a single payload
 * for the First Results panel.
 *
 * Note on estimatedLift:
 *   GSC data can lag 2-3 days. estimatedLift gives the user a visible momentum
 *   signal while real data catches up. Derived from published pages + queued
 *   opportunities — labelled as "Early Momentum" in the UI, never as hard truth.
 *
 * Uses mongoose.connection.db — getMongo() does not exist in this codebase.
 * getGSCData() reads siteUrl from GSC_SITE_URL env (no parameter needed).
 */
import connectToDatabase  from '@/lib/mongodb';
import mongoose           from 'mongoose';
import { getGSCData }     from '@/lib/gsc/getGSCData';
import { getSystemStatus }from '@/lib/dashboard/systemStatus';

export interface FirstResultsData {
  gsc: {
    impressions:         number;
    clicks:              number;
    impressionsDeltaPct: number;
    clicksDeltaPct:      number;
  };
  progress: {
    pagesPublished:          number;
    opportunitiesDiscovered: number;
    estimatedLift:           number;
  };
  trustSignals: {
    gscConnected:     boolean;
    systemLive:       boolean;
    jobsQueued:       number;
    lastAction:       string | null;
    autopilotEnabled: boolean;
  };
}

export async function getFirstResults(tenantId: string): Promise<FirstResultsData> {
  await connectToDatabase();
  const db = mongoose.connection.db!;

  const [gsc, systemStatus, publishedCount, opportunitiesCount] = await Promise.all([
    getGSCData().catch(() => null),
    getSystemStatus(tenantId),
    db.collection('drone_logs').countDocuments({
      tenantId,
      type: { $in: ['publish', 'page_published', 'content_published'] },
    }),
    db.collection('queuejobs').countDocuments({
      tenantId,
      type: { $in: ['DISCOVERY', 'CONTENT_BATCH', 'INTERNAL_LINK', 'STRUCTURE'] },
    }),
  ]);

  const estimatedLift = Math.max(
    0,
    Math.round((publishedCount * 35) + (opportunitiesCount * 8))
  );

  return {
    gsc: {
      impressions:         gsc?.impressions          ?? 0,
      clicks:              gsc?.clicks               ?? 0,
      impressionsDeltaPct: Math.round((gsc?.impressionsDelta ?? 0) * 100),
      clicksDeltaPct:      Math.round((gsc?.clicksDelta      ?? 0) * 100),
    },
    progress: {
      pagesPublished:          publishedCount,
      opportunitiesDiscovered: opportunitiesCount,
      estimatedLift,
    },
    trustSignals: {
      gscConnected:     gsc !== null,
      systemLive:       systemStatus.systemLive,
      jobsQueued:       systemStatus.jobsQueued,
      lastAction:       systemStatus.lastAction,
      autopilotEnabled: true,
    },
  };
}
