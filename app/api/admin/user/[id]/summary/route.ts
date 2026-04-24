/**
 * GET /api/admin/user/[id]/summary
 *
 * Lightweight status endpoint for dashboard polling.
 * Returns ONLY aggregate counts and status deltas — never htmlContent,
 * never full cluster arrays, never voice/review/GMB data.
 *
 * The admin user page should poll THIS route every 5 seconds for live
 * status updates, and only fetch /api/admin/user/[id] (full doc) on:
 *   - initial page load
 *   - after a user action that mutates data
 *
 * Typical response size: ~800 bytes vs ~2MB for the full doc.
 * MongoDB projection ensures only the needed fields are fetched from disk.
 */

import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAuth('superadmin');
  if (authError) return authError;

  const params = await context.params;
  const { id } = params;
  if (!id) return NextResponse.json({ error: 'Missing user id.' }, { status: 400 });

  try {
    await connectToDatabase();

    // Project ONLY the fields needed for a status summary.
    // Critically: exclude htmlContent (can be 50KB+ per cluster).
    const user = await User.findById(id)
      .select(
        'name email targetDomain seoAutomation autoSparkEnabled ' +
        'seoClusters.status seoClusters.category seoClusters.pushedAt ' +
        'seoClusters.imagesPreGenerated seoClusters.schemaPreGenerated ' +
        'seoClusters.githubSyncRequired seoClusters.liveUrl seoClusters.keyword ' +
        'onboardingConfig.testPageDeployed onboardingConfig.resendVerified ' +
        'onboardingConfig.telemetryDeployed'
      )
      .lean() as any;

    if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

    const clusters: any[] = user.seoClusters || [];

    // ── Aggregate status counts ──────────────────────────────────────────────
    const statusCounts: Record<string, number> = {};
    let imagesReady = 0;
    let syncRequired = 0;
    let schemaReady = 0;
    let liveCount = 0;
    let lastActivity: Date | null = null;

    for (const c of clusters) {
      const s = c.status || 'unknown';
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
      if (c.imagesPreGenerated) imagesReady++;
      if (c.githubSyncRequired) syncRequired++;
      if (c.schemaPreGenerated) schemaReady++;
      if (c.status === 'published' || c.status === 'Live') liveCount++;
      if (c.pushedAt) {
        const d = new Date(c.pushedAt);
        if (!lastActivity || d > lastActivity) lastActivity = d;
      }
    }

    // ── Pipeline health flags ────────────────────────────────────────────────
    const queuedCount  = (statusCounts['queued']     ?? 0) + (statusCounts['idle'] ?? 0);
    const draftCount   = statusCounts['draft']        ?? 0;
    const failedCount  = (statusCounts['Failed']      ?? 0) + (statusCounts['publish_failed'] ?? 0);
    const processingCount = (statusCounts['processing'] ?? 0) + (statusCounts['publishing'] ?? 0) +
                            (statusCounts['generating_images'] ?? 0);

    return NextResponse.json({
      userId: id,
      name:   user.name,
      domain: user.targetDomain ?? null,
      seoAutomation: user.seoAutomation ?? false,

      // Aggregate counts only — no raw cluster data
      clusterCounts: {
        total:      clusters.length,
        live:       liveCount,
        draft:      draftCount,
        queued:     queuedCount,
        processing: processingCount,
        failed:     failedCount,
        byStatus:   statusCounts,
      },

      // Pre-compute pipeline flags
      pipeline: {
        imagesReady,
        schemaReady,
        syncRequired,
        lastActivity: lastActivity?.toISOString() ?? null,
      },

      // Onboarding status
      onboarding: {
        testPageDeployed:  user.onboardingConfig?.testPageDeployed  ?? false,
        resendVerified:    user.onboardingConfig?.resendVerified    ?? false,
        telemetryDeployed: user.onboardingConfig?.telemetryDeployed ?? false,
      },

      fetchedAt: new Date().toISOString(),
    });

  } catch (err: any) {
    console.error('[USER SUMMARY ERROR]', err);
    return NextResponse.json({ error: 'Failed to fetch summary.' }, { status: 500 });
  }
}
