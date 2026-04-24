import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import mongoose from 'mongoose';

/**
 * GET /api/admin/seo/upcoming?tenantId=xxx
 * Read-only predictive layer — queue counts + drone heartbeat status.
 * No drone modification. Queries activityLogs for real last-seen timestamps.
 */

const CADENCE_HOURS: Record<string, number> = {
  llm:         3.5,  // LLM/QA posts  — 7/day ✅
  geo:         12,   // Location pages — 2/day ✅
  blog:        24,   // Blog articles  — 1/day ✅
  cornerstone: 48,   // Cornerstone   — 1 per 2 days ✅
  repair:      24,   // Repair Bay    — every 24h, all tenants ✅
};

// Activity log types that indicate each drone is alive
const DRONE_ACTIVITY_TYPES: Record<string, string[]> = {
  llm:         ['NOVA_DECISION', 'LLM_POST_CREATED', 'QA_PASSED', 'QA_FAILED'],
  geo:         ['PAGE_CREATED', 'PUBLISH_SUCCESS', 'CONTENT_GENERATED'],
  blog:        ['PAGE_CREATED', 'PUBLISH_SUCCESS', 'CONTENT_GENERATED', 'DISCOVERY_SEEDED'],
  cornerstone: ['PAGE_CREATED', 'PUBLISH_SUCCESS', 'CONTENT_GENERATED'],
  // Repair drone writes PAGE_UPDATED on every fix (links, images, GSC)
  // and REPAIR_SWEEP_COMPLETE at end of every sweep (even clean runs)
  repair:      ['PAGE_UPDATED', 'REPAIR_SWEEP_COMPLETE'],
};

// Drone name labels for display
const DRONE_NAMES: Record<string, string> = {
  llm:         '33-qa-drone',
  geo:         '04-content-drone',
  blog:        '31-blog-drone',
  cornerstone: '28-cornerstone-drone',
  repair:      '41-repair-drone',
};

function toStage(category: string): string {
  if (['llm', 'qa', 'paa'].includes(category))          return 'llm';
  if (['location', 'service'].includes(category))        return 'geo';
  if (['blog', 'article', 'update'].includes(category))  return 'blog';
  if (['cornerstone', 'pillar'].includes(category))      return 'cornerstone';
  return 'blog';
}

function confidence(count: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (count >= 5) return 'HIGH';
  if (count >= 1) return 'MEDIUM';
  return 'LOW';
}

function relativeTime(hours: number): string {
  if (hours < 1)   return `${Math.round(hours * 60)}m`;
  if (hours < 24)  return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function relativeTimeMs(ms: number): string {
  const mins  = Math.round(ms / 60000);
  const hours = Math.round(ms / 3600000);
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Convert a keyword string to a URL slug */
function toSlug(str: string): string {
  return str
    .toLowerCase()
    .replace(/['''\u2018\u2019]/g, '')       // smart quotes
    .replace(/[^a-z0-9\s-]/g, ' ')           // strip special chars
    .trim()
    .replace(/\s+/g, '-')                    // spaces → dashes
    .replace(/-+/g, '-')                     // collapse dashes
    .slice(0, 100);                          // max 100 chars
}

/** Determine URL path prefix from category */
function pathPrefix(category: string): string {
  if (category === 'blog' || category === 'paa') return '/blog/';
  if (category === 'qa')                         return '/qa/';
  return '/articles/';
}

/**
 * Composite status — combines heartbeat timing + queue state.
 * Eliminates false panic from labels that don't reflect actual work state.
 *
 * Running   — drone was active recently (good)
 * Scheduled — queue empty, but future slots exist (healthy)
 * Ready now — items are due now, waiting for drone sweep
 * Behind    — items due but drone hasn't been seen recently
 * Offline   — no heartbeat in 6h+
 */
function compositeStatus(
  lastSeenMs: number | null,
  queued: number,
  hasRealSchedule: boolean,
  cadenceHours: number,
): { key: string; label: string; dot: string; color: string } {
  const minutes = lastSeenMs !== null ? lastSeenMs / 60000 : Infinity;
  // Offline threshold = 1.5× the cadence (e.g. 18h for a 12h drone, 36h for 24h drone)
  // Never declare a drone offline if it just ran within its expected window
  const offlineMins = cadenceHours * 60 * 1.5;

  if (minutes > offlineMins)           return { key: 'offline',   label: 'Offline',    dot: '⚫', color: '#6B7280' };
  if (queued > 0 && minutes > cadenceHours * 60 * 1.1)
                                       return { key: 'behind',    label: 'Behind',     dot: '🔴', color: '#DC2626' };
  if (queued > 0)                      return { key: 'ready',     label: 'Ready now',  dot: '🟠', color: '#D97706' };
  if (minutes < 30)                    return { key: 'running',   label: 'Running',    dot: '🟢', color: '#16A34A' };
  if (hasRealSchedule)                 return { key: 'scheduled', label: 'Scheduled',  dot: '🔵', color: '#2563EB' };
  return                                      { key: 'running',   label: 'Running',    dot: '🟢', color: '#16A34A' };
}

/** Derives operating mode name from cornerstone cadence. */
function derivePipelineMode(cornerstoneCadenceHours: number): { name: string; description: string } {
  if (cornerstoneCadenceHours <= 48)  return { name: 'Ramp',   description: `Cornerstone every ${cornerstoneCadenceHours}h` };
  if (cornerstoneCadenceHours <= 96)  return { name: 'Steady', description: `Cornerstone every ${Math.round(cornerstoneCadenceHours / 24)}d` };
  return                                    { name: 'Slow',   description: `Cornerstone every ${Math.round(cornerstoneCadenceHours / 24)}d` };
}

// ── Phase 1 types + health badge (module-level so Next.js compiles cleanly) ──
type StateCounts = Record<string, number>;

function computeHealthBadge(
  lastSeenMs: number | null,
  cadenceHours: number,
  publishedToday: number,
  sc: StateCounts,
  queued: number,
): { status: string; emoji: string; color: string; reason: string | null } {
  const intervalMs = cadenceHours * 3600000;
  const templated  = sc['templated']  || 0;
  const generating = sc['generating'] || 0;
  const structured = sc['structured'] || 0;
  const stale      = sc['__stale__']  || 0;
  const failed     = sc['failed']     || 0;

  // BLOCKED checks (highest priority — pipeline jams)
  if (templated >= 5 && publishedToday === 0)
    return { status:'BLOCKED', emoji:'⚠️', color:'#F59E0B', reason:`${templated} jobs stuck in templated — publish not firing` };
  if (generating >= 8 && structured === 0)
    return { status:'BLOCKED', emoji:'⚠️', color:'#F59E0B', reason:`${generating} jobs stuck in generating — structure drone blocked` };
  if (stale >= 5)
    return { status:'BLOCKED', emoji:'⚠️', color:'#F59E0B', reason:`${stale} jobs haven't moved in 6h+ — pipeline stalled` };
  if (failed >= 3)
    return { status:'BLOCKED', emoji:'⚠️', color:'#F59E0B', reason:`${failed} failed jobs — check drone logs` };

  // Idle with no work = healthy (not delayed)
  if (queued === 0 && stale === 0 && failed === 0 && publishedToday > 0)
    return { status:'HEALTHY', emoji:'🟢', color:'#16A34A', reason: null };

  if (lastSeenMs === null)
    return { status:'UNKNOWN', emoji:'⚫', color:'#9CA3AF', reason:'No activity recorded yet — may be first run' };

  // Health bands — only fire when there IS work waiting
  if (lastSeenMs < intervalMs * 1.5) return { status:'HEALTHY', emoji:'🟢', color:'#16A34A', reason: null };
  if (queued === 0)                  return { status:'HEALTHY', emoji:'🟢', color:'#16A34A', reason: null };
  if (lastSeenMs < intervalMs * 3)   return { status:'DELAYED', emoji:'🟡', color:'#D97706', reason:`Jobs waiting — drone last active ${Math.round(lastSeenMs/3600000)}h ago (expected every ${cadenceHours}h)` };
  if (lastSeenMs < intervalMs * 6)   return { status:'STALLED', emoji:'🔴', color:'#DC2626', reason:`${queued} jobs waiting — no activity for ${Math.round(lastSeenMs/3600000)}h — drone may need restart` };
  return                                     { status:'DEAD',    emoji:'⚫', color:'#6B7280', reason:`${queued} jobs waiting — no heartbeat for ${Math.round(lastSeenMs/3600000)}h — drone appears offline` };
}

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const tenantId = req.nextUrl.searchParams.get('tenantId');
    if (!tenantId) return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });

    const db = mongoose.connection.db!;

    let tenantOid: any;
    try { tenantOid = new mongoose.Types.ObjectId(tenantId); }
    catch {
      // Not a valid ObjectId — try looking up by domain name
      const byDomain = await db.collection('users').findOne(
        { targetDomain: tenantId },
        { projection: { _id: 1 } }
      );
      if (!byDomain) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
      tenantOid = byDomain._id;
    }



    // ── Lightweight cluster projection (avoids loading HTML content) ─────────
    // Fetching only the fields the upcoming panel actually uses cuts query time
    // from 28 seconds (full doc) down to < 1 second.
    const [agg] = await db.collection('users').aggregate([
      { $match: { _id: tenantOid } },
      { $project: {
        targetDomain: 1,
        seoClusters: {
          $map: {
            input: { $ifNull: ['$seoClusters', []] },
            as: 'c',
            in: {
              _id:                      '$$c._id',
              status:                   '$$c.status',
              category:                 '$$c.category',
              pushedAt:                 '$$c.pushedAt',
              updatedAt:                '$$c.updatedAt',
              scheduledTime:            '$$c.scheduledTime',
              repairStatus:             '$$c.repairStatus',
              internalLinksPreGenerated:'$$c.internalLinksPreGenerated',
              imageHealth:              '$$c.imageHealth',
              keyword:                  '$$c.keyword',
              slug:                     '$$c.slug',
              liveUrl:                  '$$c.liveUrl',
            }
          }
        }
      }}
    ], { maxTimeMS: 15000 }).toArray();

    if (!agg) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const domain = (agg.targetDomain || '').replace(/\/+$/, '');
    const domainRoot = domain ? `https://${domain.replace(/^https?:\/\//, '')}` : '';

    const buildUrl = (c: any): string | null => {
      if (c.liveUrl) return c.liveUrl;
      if (!domainRoot) return null;
      const slug = c.slug || toSlug(c.keyword || '');
      if (!slug) return null;
      return `${domainRoot}${pathPrefix(c.category || 'service')}${slug}/`;
    };

    const clusters: any[] = agg.seoClusters || [];
    const now = Date.now();

    // ── Queue counts & Samples ──────────────────────────────────────────────
    const stageCounts: Record<string, number> = { llm: 0, geo: 0, blog: 0, cornerstone: 0, repair: 0 };
    // Repair breakdown per type
    const repairBreakdown = { links: 0, images: 0, gsc: 0 };
    // Sample pages needing repair (for card display)
    const repairSamples: Array<{ keyword: string; issues: string[] }> = [];

    // General samples for content drones (last 5 active/published/queued)
    const stageSamples: Record<string, Array<{ keyword: string; status: string }>> = {
      llm: [], geo: [], blog: [], cornerstone: []
    };

    // Sort clusters descending by recency to get the "last 5"
    const sortedClusters = [...clusters].sort((a, b) => {
      const tsA = new Date(a.updatedAt || a.pushedAt || a.scheduledTime || 0).getTime();
      const tsB = new Date(b.updatedAt || b.pushedAt || b.scheduledTime || 0).getTime();
      return tsB - tsA;
    });

    for (const c of sortedClusters) {
      if (['competitor', 'backlink'].includes(c.category || '')) continue;
      
      const stg = toStage(c.category || 'blog');
      // For queue counts, we only look at idle/queued
      if (['idle', 'queued'].includes(c.status)) {
        stageCounts[stg]++;
      }

      // Collect top 5 samples for the content drone UI
      if (stageSamples[stg] && stageSamples[stg].length < 5) {
         const timeAgoMs = now - new Date(c.updatedAt || c.pushedAt || c.scheduledTime || 0).getTime();
         stageSamples[stg].push({ 
           keyword: c.keyword || c.slug || 'Unknown', 
           status: c.status || 'queued',
           liveUrl: buildUrl(c),
           timeAgo: relativeTimeMs(timeAgoMs)
         });
      }

      // Repair drone queue = ALL three things it actually fixes:
      //   1. Live pages missing internal links
      //   2. Live pages with broken images (flagged by scan-images)
      //   3. Live pages with GSC issues (flagged by gsc sync)
      if (['published', 'Live'].includes(c.status)) {
        const needsLinks  = !c.internalLinksPreGenerated;
        const hasBroken   = (c.imageHealth?.broken ?? 0) > 0;
        const hasGscIssue = c.repairStatus === 'needs_fix';
        if (needsLinks || hasBroken || hasGscIssue) {
          // We don't want to increment stageCounts.repair multiple times for the same page, 
          // but we sorted clusters so we're just counting them here. Wait, since we are iterating 
          // sortedClusters, if the logic executes once per cluster, it's fine.
          stageCounts.repair++;
          if (needsLinks)  repairBreakdown.links++;
          if (hasBroken)   repairBreakdown.images++;
          if (hasGscIssue) repairBreakdown.gsc++;
          // Collect up to 5 sample pages for display
          if (repairSamples.length < 5) {
            const issues: string[] = [];
            if (needsLinks)  issues.push('links');
            if (hasBroken)   issues.push('images');
            if (hasGscIssue) issues.push('gsc');
            const timeAgoMs = now - new Date(c.updatedAt || c.pushedAt || c.scheduledTime || 0).getTime();
            repairSamples.push({ 
              keyword: c.keyword || c.slug || 'Unknown page', 
              issues,
              liveUrl: buildUrl(c),
              timeAgo: relativeTimeMs(timeAgoMs)
            });
          }
        }
      }
    }

    // ── Published today ─────────────────────────────────────────────────────
    // Count ACTUAL new pages created today — NOT pages that were merely re-pushed
    // by the repair/sync drones. We use activityLogs (ground truth of drone output).
    const recentlyPublished: Record<string, number> = { llm: 0, geo: 0, blog: 0, cornerstone: 0, repair: 0 };
    const cutoff24h = new Date(now - 86400000);

    // Stage → activity log type mapping (only count real creation events)
    const PUBLISH_LOG_TYPES: Record<string, string[]> = {
      llm:         ['PAGE_PUBLISHED', 'DRONE_PUBLISH', 'page_published'],
      geo:         ['PAGE_PUBLISHED', 'DRONE_PUBLISH', 'page_published'],
      blog:        ['PAGE_PUBLISHED', 'DRONE_PUBLISH', 'page_published'],
      cornerstone: ['PAGE_PUBLISHED', 'DRONE_PUBLISH', 'page_published'],
      repair:      ['REPAIR_SWEEP_COMPLETE', 'PAGE_UPDATED'],
    };

    try {
      // Query activityLogs for real publish events in the last 24h
      const recentLogs = await db.collection('activitylogs').find({
        userId: tenantId,
        timestamp: { $gt: cutoff24h },
        type: { $in: ['PAGE_PUBLISHED', 'DRONE_PUBLISH', 'page_published', 'REPAIR_SWEEP_COMPLETE', 'PAGE_UPDATED'] },
      }).toArray();

      for (const log of recentLogs as any[]) {
        // Determine stage from the log's metadata or message
        const cat  = log.metadata?.category || '';
        const msg  = log.message || '';
        const type = log.type || '';

        if (['REPAIR_SWEEP_COMPLETE', 'PAGE_UPDATED'].includes(type) && (msg.includes('🔗') || msg.includes('🖼') || msg.includes('📡') || msg.includes('Repair') || msg.includes('repair'))) {
          recentlyPublished.repair++;
        } else if (['PAGE_PUBLISHED', 'DRONE_PUBLISH', 'page_published'].includes(type)) {
          const stage = cat ? toStage(cat) : 'blog';
          recentlyPublished[stage]++;
        }
      }
    } catch (_) {
      // If activityLogs query fails, fall back to 0 — better to undercount than inflate
    }

    // ── Per-stage state counts (BLOCKED detection) ───────────────────────────
    const stateCountsByStage: Record<string, StateCounts> = {
      llm: {}, geo: {}, blog: {}, cornerstone: {}, repair: {}
    };
    const cutoff6h = new Date(now - 6 * 3600000);
    for (const c of clusters) {
      const stage  = toStage(c.category || 'blog');
      const status = c.status || 'unknown';
      if (['generating','structured','templated','processing','draft','failed'].includes(status)) {
        stateCountsByStage[stage][status] = (stateCountsByStage[stage][status] || 0) + 1;
        const updatedAt = c.updatedAt ? new Date(c.updatedAt) : null;
        if (updatedAt && updatedAt < cutoff6h) {
          stateCountsByStage[stage]['__stale__'] = (stateCountsByStage[stage]['__stale__'] || 0) + 1;
        }
      }
    }

    // ── Truth layer: DroneHeartbeat → activityLogs fallback ─────────────────
    // Phase 2: EC2 drones POST real heartbeats. If present, use them as ground
    // truth. If not yet wired, fall back to activityLog inference (Phase 1).
    const lastSeenByStage: Record<string, number | null> = {
      llm: null, geo: null, blog: null, cornerstone: null, repair: null,
    };
    // Heartbeat metadata per stage (null until EC2 drones are wired)
    const heartbeatMeta: Record<string, { host: string; status: string } | null> = {
      llm: null, geo: null, blog: null, cornerstone: null, repair: null,
    };

    // Map drone names → stages
    const DRONE_NAME_TO_STAGE: Record<string, string> = {
      '33-qa-drone':          'llm',
      '04-content-drone':     'geo',
      '31-blog-drone':        'blog',
      '28-cornerstone-drone': 'cornerstone',
      '41-repair-drone':      'repair',
    };

    try {
      // ① Primary: real heartbeats from EC2
      const beats = await db.collection('droneheartbeats').find({}).toArray();
      for (const b of beats as any[]) {
        const stage = DRONE_NAME_TO_STAGE[b.drone];
        if (stage && b.lastHeartbeatAt) {
          const ms = now - new Date(b.lastHeartbeatAt).getTime();
          // Only use if heartbeat is recent enough to be trustworthy (< 7 days)
          if (ms < 7 * 24 * 3600000) {
            lastSeenByStage[stage] = ms;
            heartbeatMeta[stage]   = { host: b.host || 'ec2', status: b.status || 'ok' };
          }
        }
      }
    } catch (_) { /* heartbeat collection not yet populated — use fallback */ }

    try {
      // ② Fallback: infer from activityLogs for any stage without a heartbeat
      for (const stage of ['llm', 'geo', 'blog', 'cornerstone', 'repair']) {
        if (lastSeenByStage[stage] !== null) continue; // already have heartbeat
        const types   = DRONE_ACTIVITY_TYPES[stage];
        const lastLog = await db.collection('activityLogs').findOne(
          { userId: tenantId, type: { $in: types } },
          { sort: { timestamp: -1 }, projection: { timestamp: 1 } }
        );
        if (lastLog?.timestamp) {
          lastSeenByStage[stage] = now - new Date(lastLog.timestamp).getTime();
        }
      }
    } catch (_) { /* activityLogs query failed — fall back to cluster update times */ }

    // Fallback: if no log found, infer from cluster updatedAt times per category
    const stageCategoriesMap: Record<string, string[]> = {
      llm:         ['llm', 'qa', 'paa'],
      geo:         ['location', 'service'],
      blog:        ['blog', 'article', 'update'],
      cornerstone: ['cornerstone', 'pillar'],
      repair:      [], // repair drone works across all categories — fallback = any repairStatus update
    };
    for (const stage of ['llm', 'geo', 'blog', 'cornerstone', 'repair']) {
      if (lastSeenByStage[stage] !== null) continue;
      if (stage === 'repair') {
        // Repair drone fallback: most recent repairStatus update across any cluster
        const mostRecent = clusters
          .filter(c => c.repairStatus && c.updatedAt)
          .map(c => new Date(c.updatedAt).getTime())
          .sort((a, b) => b - a)[0];
        if (mostRecent) lastSeenByStage.repair = now - mostRecent;
        continue;
      }
      const cats = stageCategoriesMap[stage];
      const stageClusters = clusters.filter(c => cats.includes(c.category || ''));
      const mostRecent = stageClusters
        .map(c => c.updatedAt || c.draftCreatedAt || c.pushedAt)
        .filter(Boolean)
        .map(d => new Date(d).getTime())
        .sort((a, b) => b - a)[0];
      if (mostRecent) {
        lastSeenByStage[stage] = now - mostRecent;
      }
    }

    // ── Next scheduled time per stage ──────────────────────────────────────
    // For ALL stages: if drone has run before, next = lastSeen + cadence.
    // This is honest — it tells you exactly when the next sweep is due.
    // Fall back to DB-stored scheduledTime only if no heartbeat found.
    const nextScheduledByStage: Record<string, number | null> = {
      llm: null, geo: null, blog: null, cornerstone: null, repair: null,
    };
    for (const stage of ['llm', 'geo', 'blog', 'cornerstone', 'repair']) {
      const cadenceHours = CADENCE_HOURS[stage];
      if (lastSeenByStage[stage] !== null) {
        // Show a countdown for all drones based on their persistent polling cycle
        nextScheduledByStage[stage] = now - (lastSeenByStage[stage] as number) + cadenceHours * 3600000;
        continue;
      }
      if (stage === 'repair') {
        // Never run but has queued work → first sweep is imminent
        if (stageCounts.repair > 0) nextScheduledByStage.repair = now + cadenceHours * 3600000;
        continue;
      }
      // No heartbeat for content drones → check DB-stored scheduledTime
      const cats = stageCategoriesMap[stage];
      const futureClusters = clusters
        .filter(c =>
          ['idle', 'queued'].includes(c.status) &&
          cats.includes(c.category || '') &&
          c.scheduledTime &&
          new Date(c.scheduledTime).getTime() > now
        )
        .map(c => new Date(c.scheduledTime).getTime())
        .sort((a, b) => a - b);
      if (futureClusters.length > 0) {
        nextScheduledByStage[stage] = futureClusters[0];
      }
    }

    // ── Build response ──────────────────────────────────────────────────────

    const upcoming = ['llm', 'geo', 'blog', 'cornerstone', 'repair'].map(stage => {
      const queued           = stageCounts[stage] || 0;
      const cadenceHours     = CADENCE_HOURS[stage];
      const lastSeenMs       = lastSeenByStage[stage];
      const nextRealMs       = nextScheduledByStage[stage];
      // nextIn: use real schedule when available.
      // When no schedule exists:
      //   - If drone has queued work, estimate = lastSeen + cadence (conservative)
      //   - If queue is empty + no schedule, show null = "Idle" (no phantom timers)
      let nextInHours: number | null = null;
      if (nextRealMs) {
        nextInHours = Math.max(0, (nextRealMs - now) / 3600000);
      } else if (queued > 0 && lastSeenMs !== null) {
        // Drone has work but no explicit schedule — next run = lastRun + cadence
        nextInHours = Math.max(0, cadenceHours - (lastSeenMs / 3600000));
      } else if (queued > 0) {
        // Has work, never seen — show full cadence
        nextInHours = cadenceHours;
      }
      // else: queued=0, no schedule → null (idle — no countdown)
      const hasRealSchedule  = nextRealMs !== null;
      const cs               = compositeStatus(lastSeenMs, queued, hasRealSchedule, cadenceHours);

      const LABELS: Record<string, string> = {
        llm: 'LLM / QA Posts', geo: 'Location Pages', blog: 'Blog Articles',
        cornerstone: 'Cornerstone Pages', repair: 'Repair Bay',
      };
      const ICONS: Record<string, string> = {
        llm: '🤖', geo: '📍', blog: '✍️', cornerstone: '🏗️', repair: '🔧',
      };
      const COLORS: Record<string, string> = {
        llm: '#16A34A', geo: '#D97706', blog: '#2563EB', cornerstone: '#7C3AED', repair: '#0891B2',
      };

      return {
        stage,
        label:          LABELS[stage] || stage,
        icon:           ICONS[stage]  || '🔧',
        color:          COLORS[stage] || '#64748B',
        droneName:      DRONE_NAMES[stage],
        queued,
        // For repair drone: 'publishedToday' = pages fixed in last 24h
        publishedToday: recentlyPublished[stage] || 0,
        fixedToday:     stage === 'repair' ? (recentlyPublished.repair || 0) : undefined,
        cadenceHours,
        nextPublishAt:  nextInHours !== null ? new Date(now + nextInHours * 3600000).toISOString() : null,
        nextInMs:       nextInHours !== null ? Math.round(nextInHours * 3600000) : null,
        nextIn:         nextInHours !== null ? relativeTime(nextInHours) : null,
        hasRealSchedule,
        confidence:     queued === 0 && !hasRealSchedule ? 'LOW' : confidence(Math.max(queued, hasRealSchedule ? 1 : 0)),
        droneStatus:    cs.key,
        statusDot:      cs.dot,
        statusLabel:    cs.label,
        statusColor:    cs.color,
        lastSeen:       lastSeenMs !== null ? relativeTimeMs(lastSeenMs) : 'never',
        // ── Phase 1: intelligence ──────────────────────────────────────────
        health:         computeHealthBadge(lastSeenMs, cadenceHours, recentlyPublished[stage] || 0, stateCountsByStage[stage] || {}, queued),
        stateCounts:    stateCountsByStage[stage] || {},
        // ── Phase 2: heartbeat truth source ───────────────────────────────
        // null = still using inferred/activityLog signal
        // { host, status } = real EC2 heartbeat received
        heartbeatSource: heartbeatMeta[stage] ?? null,
        // Samples for UI viewing
        samples:         stageSamples[stage] || [],
        // Repair-specific extras (only populated for stage === 'repair')
        repairBreakdown: stage === 'repair' ? repairBreakdown : undefined,
        repairSamples:   stage === 'repair' ? repairSamples   : undefined,

      };
    });

    const mode = derivePipelineMode(CADENCE_HOURS.cornerstone);
    return NextResponse.json({ upcoming, mode, asOf: new Date().toISOString() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
