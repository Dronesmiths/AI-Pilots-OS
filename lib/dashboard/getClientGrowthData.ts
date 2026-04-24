/**
 * lib/dashboard/getClientGrowthData.ts
 *
 * Data layer for the per-tenant client growth dashboard.
 * Source of truth priority:
 *   1. seoClusters (embedded in User) → published page count + queue
 *   2. activityLogs (raw Mongo collection) → timestamps, growth chart, recent pages
 *
 * tenantId resolution:
 *   - Valid ObjectId        → User._id lookup
 *   - Tenant slug           → Tenant.tenantId → User.targetDomain
 *   - Slug match (fallback) → User.name or businessName slug
 */

import connectToDatabase            from '@/lib/mongodb';
import mongoose                     from 'mongoose';
import User                         from '@/models/User';
import Tenant                       from '@/models/Tenant';

export interface ClientGrowthData {
  userId:        string;
  tenantId:      string;
  clientName:    string;
  domain:        string;
  engineStatus:  'ACTIVE' | 'THROTTLED' | 'IDLE';
  todayCount:    number;
  dailyLimit:    number;
  remaining:     number;
  totalPages:    number;
  queueReady:    number;
  nextPublish:   string;
  recentPages: Array<{
    slug:  string;
    url:   string;
    title: string;
    date:  string;
  }>;
  growth: Array<{          // last 14 days
    date:  string;
    count: number;
  }>;
  /** Clusters in pre-publish pipeline — shown in queue tab */
  queuedClusters: Array<{
    keyword: string;
    status:  'queued' | 'processing' | 'built' | 'enhanced' | 'ready';
  }>;
}

function toSlug(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export async function getClientGrowthData(tenantIdParam: string): Promise<ClientGrowthData> {
  await connectToDatabase();

  // ── 1. Resolve user record ─────────────────────────────────────────────────
  let user: any = null;

  // a) Direct ObjectId match
  if (mongoose.isValidObjectId(tenantIdParam)) {
    user = await User.findById(tenantIdParam).lean();
  }

  // b) Tenant slug → domain → User
  if (!user) {
    const tenant = await Tenant.findOne({ tenantId: tenantIdParam }).lean();
    if (tenant) {
      user = await User.findOne({
        targetDomain: { $regex: (tenant as any).domain?.replace(/^https?:\/\//, '').replace(/\/$/, ''), $options: 'i' }
      }).lean();
    }
  }

  // c) Name slug fallback
  if (!user) {
    const allUsers = await User.find({}, { name: 1, targetDomain: 1 }).lean();
    user = allUsers.find((u: any) => toSlug(u.name || '') === tenantIdParam) ?? null;
    if (user) user = await User.findById(user._id).lean();
  }

  if (!user) throw new Error(`Tenant not found: ${tenantIdParam}`);

  const userId      = String(user._id);
  const domain      = (user.targetDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '') || `${tenantIdParam}.local`;
  const clientName  = (user as any).businessName || user.name || tenantIdParam;
  const dailyLimit: number = (user as any).seoSettings?.pagesPerDay ?? user.dailyPageProductionLimit ?? 3;

  // ── 2. seoClusters — canonical page state ─────────────────────────────────
  const clusters: any[] = user.seoClusters ?? [];
  const publishedClusters = clusters.filter((c: any) => c.status === 'published' || c.status === 'Live');
  const totalPages = publishedClusters.length;

  const IN_PIPELINE = ['queued', 'processing', 'built', 'enhanced', 'ready'];
  const queueReady  = clusters.filter((c: any) => IN_PIPELINE.includes(c.status)).length;

  const queuedClusters = clusters
    .filter((c: any) => IN_PIPELINE.includes(c.status))
    .slice(0, 20)
    .map((c: any) => ({ keyword: c.keyword || '(untitled)', status: c.status as any }));

  // ── 3. activityLogs — today count + growth chart + recent pages ───────────
  const db = mongoose.connection.db!;
  const logsCol = db.collection('activityLogs');

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // Today's PAGE_CREATED count (using ISO string timestamp, as supervisor writes it)
  const todayCount = await logsCol.countDocuments({
    userId,
    type:      'PAGE_CREATED',
    timestamp: { $gte: todayStart.toISOString() },
  });

  // Last 14 days of PAGE_CREATED for growth chart
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
  fourteenDaysAgo.setUTCHours(0, 0, 0, 0);

  const recentLogs = await logsCol
    .find({
      userId,
      type:      'PAGE_CREATED',
      timestamp: { $gte: fourteenDaysAgo.toISOString() },
    })
    .sort({ timestamp: -1 })
    .toArray();

  // Build growth map seeded with zeros for each of the 14 days
  const growthMap = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    growthMap.set(formatShortDate(d), 0);
  }
  for (const log of recentLogs) {
    const key = formatShortDate(new Date(log.timestamp));
    if (growthMap.has(key)) growthMap.set(key, (growthMap.get(key) ?? 0) + 1);
  }
  const growth = Array.from(growthMap.entries()).map(([date, count]) => ({ date, count }));

  // Recent pages — prefer activityLogs, fall back to seoClusters
  let recentPages: ClientGrowthData['recentPages'] = [];
  if (recentLogs.length > 0) {
    recentPages = recentLogs.slice(0, 10).map((log: any) => {
      const kw   = log.metadata?.keyword ?? log.message ?? 'Page';
      const slug = log.metadata?.slug ?? log.metadata?.url?.split('/').filter(Boolean).pop() ?? '';
      const url  = log.metadata?.url ?? `https://${domain}/articles/${slug}/`;
      return { slug, url, title: kw, date: log.timestamp };
    });
  } else {
    // Fallback: pull from published seoClusters ordered by pushedAt
    recentPages = publishedClusters
      .sort((a: any, b: any) => new Date(b.pushedAt || 0).getTime() - new Date(a.pushedAt || 0).getTime())
      .slice(0, 10)
      .map((c: any) => ({
        slug:  c.slug  || '',
        url:   c.liveUrl || `https://${domain}/articles/${c.slug || ''}/`,
        title: c.keyword || c.slug || 'Page',
        date:  c.pushedAt ? new Date(c.pushedAt).toISOString() : new Date().toISOString(),
      }));
  }

  // ── 4. Derived status ──────────────────────────────────────────────────────
  const engineStatus: ClientGrowthData['engineStatus'] =
    todayCount >= dailyLimit ? 'THROTTLED' : todayCount > 0 ? 'ACTIVE' : 'IDLE';

  return {
    userId,
    tenantId:       tenantIdParam,
    clientName,
    domain,
    engineStatus,
    todayCount,
    dailyLimit,
    remaining:      Math.max(0, dailyLimit - todayCount),
    totalPages,
    queueReady,
    nextPublish:    todayCount >= dailyLimit ? 'Tomorrow' : 'Today',
    recentPages,
    growth,
    queuedClusters,
  };
}
