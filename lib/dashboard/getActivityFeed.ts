/**
 * lib/dashboard/getActivityFeed.ts
 *
 * Reads recent drone_logs and normalizes them into UI-safe feed items.
 * The quality of this feed is entirely determined by what drones write to drone_logs.
 *
 * Good log message examples (drones should write these):
 *   "Published new page: /palmdale-real-estate-guide"
 *   "Added 18 internal links across 6 pages"
 *   "Discovery complete: 14 new opportunities found"
 *   "QA passed: /church-app-pricing"
 *   "Reinforcement applied to 4 underperforming pages"
 */
import connectToDatabase from '@/lib/mongodb';
import mongoose          from 'mongoose';

export interface ActivityFeedItem {
  id:        string;
  type:      string;
  message:   string;
  createdAt: string;
  status:    'success' | 'running' | 'warning' | 'error';
  highlight?: boolean;
}

export async function getActivityFeed(
  tenantId: string,
  limit = 20,
): Promise<ActivityFeedItem[]> {
  await connectToDatabase();
  const db = mongoose.connection.db!;

  const logs = await db
    .collection('drone_logs')
    .find({ tenantId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return logs.map((log: any) => ({
    id:        String(log._id),
    type:      log.type    || 'activity',
    message:   log.message || 'System activity recorded',
    createdAt: new Date(log.createdAt || Date.now()).toISOString(),
    status:    normalizeStatus(log.status),
    highlight: isHighlight(log.type, log.message),
  }));
}

function normalizeStatus(status?: string): ActivityFeedItem['status'] {
  if (status === 'error' || status === 'failed') return 'error';
  if (status === 'warning')                      return 'warning';
  if (status === 'running' || status === 'queued') return 'running';
  return 'success';
}

export function isHighlight(type?: string, message?: string): boolean {
  const text = `${type ?? ''} ${message ?? ''}`.toLowerCase();
  return (
    text.includes('publish')       ||
    text.includes('reinforce')     ||
    text.includes('internal link') ||
    text.includes('discovery')     ||
    text.includes('qa passed')     ||
    text.includes('activation')
  );
}
