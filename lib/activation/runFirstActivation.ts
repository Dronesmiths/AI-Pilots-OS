/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/activation/runFirstActivation.ts
 *
 * Master orchestrator for client first-run activation.
 * Called by runInstallFlow after successful install,
 * or directly from /api/activation/run.
 *
 * Flow:
 *   1. Create/reset ActivationState → running
 *   2. GSC sync (real or fallback)
 *   3. Seed metrics
 *   4. Seed growth feed
 *   5. Generate opportunities
 *   6. Activate autopilot
 *   7. Mark complete
 */

import connectToDatabase              from '@/lib/mongodb';
import ActivationState                from '@/models/ActivationState';
import OnboardingSession              from '@/models/onboarding/OnboardingSession';
import ConnectedDomain                from '@/models/onboarding/ConnectedDomain';
import ConnectedGSCProperty           from '@/models/onboarding/ConnectedGSCProperty';
import TenantRuntimeState             from '@/models/TenantRuntimeState';
import { triggerInitialSync }         from './triggerInitialSync';
import { seedInitialMetrics }         from './seedInitialMetrics';
import { seedGrowthFeed }             from './seedGrowthFeed';
import { evaluateInitialOpportunities } from './evaluateInitialOpportunities';
import { setAutopilotState }          from './setAutopilotState';
import { emitLifecycleEvent }         from '@/lib/system/emitLifecycleEvent';

export interface ActivationResult {
  ok:          boolean;
  clientId:    string;
  metrics:     any;
  opportunities: any[];
  error:       string;
}

export async function runFirstActivation(params: {
  tenantId: string;
  clientId: string;
}): Promise<ActivationResult> {
  const { tenantId, clientId } = params;
  await connectToDatabase();

  // ── Load context ──────────────────────────────────────────────
  const [session, domain, gsc] = await Promise.all([
    OnboardingSession.findOne({ tenantId, clientId }).lean() as any,
    ConnectedDomain.findOne({ tenantId, clientId }).lean() as any,
    ConnectedGSCProperty.findOne({ tenantId, clientId }).lean() as any,
  ]);

  const niche      = session?.business?.niche     ?? 'local_business';
  const city       = session?.business?.city      ?? '';
  const brandName  = session?.business?.name      ?? 'Your Business';
  const domainStr  = domain?.normalizedDomain     ?? session?.business?.domain ?? '';
  const config     = session?.engineConfig?.starterConfig;
  const pages      = config?.starterPages  ?? [];
  const topics     = config?.starterTopics ?? [];

  // ── Create/reset activation state ────────────────────────────
  await ActivationState.findOneAndUpdate(
    { tenantId, clientId },
    {
      $set: {
        status:     'running',
        startedAt:  new Date(),
        errors:     [],
        steps: {
          gscSync:                false,
          metricsSeeded:          false,
          growthFeedCreated:      false,
          opportunitiesGenerated: false,
          autopilotActivated:     false,
        },
      },
    },
    { upsert: true }
  );

  const errors: string[] = [];

  try {
    // ── Step 1: GSC Sync ────────────────────────────────────────
    const syncResult = await triggerInitialSync({
      clientId, domain: domainStr, niche, city,
    });
    await ActivationState.updateOne({ tenantId, clientId }, { $set: { 'steps.gscSync': true } });

    // ── Step 2: Seed metrics ────────────────────────────────────
    const metrics = await seedInitialMetrics({
      tenantId, clientId,
      syncResult,
      pagesCount:  pages.length  || 5,
      topicsCount: topics.length || 8,
    });

    // ── Step 3: Seed growth feed ────────────────────────────────
    await seedGrowthFeed({
      tenantId, clientId, niche, city, brandName,
      pagesCount:  pages.length  || 5,
      topicsCount: topics.length || 8,
      topQuery:    syncResult.topQueries[0]?.query,
    });

    // ── Step 4: Evaluate opportunities ──────────────────────────
    const opportunities = await evaluateInitialOpportunities({
      tenantId, clientId, niche, city,
      topQueries:   syncResult.topQueries,
      starterPages: pages,
    });

    // ── Step 5: Activate autopilot ──────────────────────────────
    await setAutopilotState({ tenantId, clientId, mode: 'balanced' });

    // ── Mark complete ───────────────────────────────────────────
    await ActivationState.updateOne(
      { tenantId, clientId },
      { $set: { status: 'complete', completedAt: new Date() } }
    );

    // Also update OnboardingSession
    await OnboardingSession.updateOne(
      { tenantId, clientId },
      { $set: { 'postInstall.firstRunComplete': true } }
    ).catch(() => {});

    // ── Lifecycle: emit activated + init tenant runtime state ────
    // Both are fire-and-forget — never block or fail activation.
    await emitLifecycleEvent({
      tenantId,
      type:    'activated',
      state:   'cold',
      message: `Tenant activated — GSC synced, metrics seeded, autopilot armed`,
      metadata: { jobsProcessed: 0 },
    });
    await TenantRuntimeState.findOneAndUpdate(
      { tenantId },
      { $setOnInsert: { tenantId, state: 'cold', activatedAt: new Date(), metrics: {} } },
      { upsert: true }
    ).catch(() => {});

    return { ok: true, clientId, metrics, opportunities, error: '' };

  } catch (err: any) {
    const msg = err.message ?? 'Unknown activation error';
    errors.push(msg);
    await ActivationState.updateOne(
      { tenantId, clientId },
      { $set: { status: 'failed', errors } }
    );
    return { ok: false, clientId, metrics: null, opportunities: [], error: msg };
  }
}
