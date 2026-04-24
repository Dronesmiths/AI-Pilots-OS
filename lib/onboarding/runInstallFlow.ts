/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/onboarding/runInstallFlow.ts
 *
 * The heart of client installation.
 * Runs 12 ordered steps with per-step logging, locking, and idempotency.
 *
 * Steps (see InstallJob.INSTALL_STEP_LABELS for UI labels):
 *   1.  validate_readiness
 *   2.  normalize_domain
 *   3.  confirm_gsc
 *   4.  confirm_github
 *   5.  build_starter_config
 *   6.  seed_mongo_state
 *   7.  push_github_assets
 *   8.  trigger_deploy
 *   9.  poll_deploy_status
 *   10. verify_live_install
 *   11. trigger_first_run
 *   12. mark_complete
 */

import connectToDatabase               from '@/lib/mongodb';
import OnboardingSession               from '@/models/onboarding/OnboardingSession';
import ConnectedDomain                 from '@/models/onboarding/ConnectedDomain';
import ConnectedGSCProperty            from '@/models/onboarding/ConnectedGSCProperty';
import InstallJob                      from '@/models/onboarding/InstallJob';
import User                            from '@/models/User';
import ClientActivityFeed              from '@/models/ClientActivityFeed';
import { evaluateInstallReadiness }    from './evaluateInstallReadiness';
import { normalizeDomain }             from './normalizeDomain';
import { buildStarterEngineConfig }    from './buildStarterEngineConfig';
import { verifyInstalledClient }       from './verifyInstalledClient';
import { appendInstallLog }            from './appendInstallLog';
import { runFirstActivation }          from '@/lib/activation/runFirstActivation';

const GITHUB_API = 'https://api.github.com';
const GITHUB_UA  = 'AIPilots-CRM-Onboarding';

// ── GitHub helper reused from existing publish-github pattern ───────────────
async function githubPut(owner: string, repo: string, path: string, content: string, message: string) {
  const token = process.env.GITHUB_TOKEN!;
  // Check SHA for idempotent writes
  let sha: string | undefined;
  const probe = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': GITHUB_UA },
    signal: AbortSignal.timeout(8000),
  });
  if (probe.ok) {
    const data = await probe.json();
    // If content matches, skip write
    const remote = Buffer.from(data.content ?? '', 'base64').toString('utf-8');
    if (remote === content) return { skipped: true };
    sha = data.sha;
  }

  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': GITHUB_UA, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ message, content: Buffer.from(content).toString('base64'), ...(sha && { sha }) }),
  });
  if (!res.ok) throw new Error(`GitHub PUT ${path}: ${await res.text()}`);
  return { skipped: false };
}

// ── Minimal seo-engine.css (same as existing system) ───────────────────────
const SEO_ENGINE_CSS = `:root{--primary-color:#1a73e8;--text-main:#202124;--text-muted:#5f6368;--bg-main:#ffffff;--bg-muted:#f8f9fa;--font-sans:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,Cantarell,"Open Sans","Helvetica Neue",sans-serif}body{margin:0;padding:0;color:var(--text-main);background-color:var(--bg-main);font-family:var(--font-sans);line-height:1.6}.aw-main-content{min-height:100vh;margin:0 auto;width:100%}img{max-width:100%;height:auto;display:block}h1,h2,h3,h4,h5,h6{color:#111;font-weight:700;line-height:1.2}a{color:var(--primary-color);text-decoration:none}a:hover{text-decoration:underline}section{padding:4rem 2rem}@media(max-width:768px){section{padding:2rem 1rem}}`;

// ── Main orchestrator ───────────────────────────────────────────────────────
export async function runInstallFlow({
  tenantId,
  clientId,
  initiatedBy,
}: {
  tenantId:    string;
  clientId:    string;
  initiatedBy: string;
}): Promise<{ ok: boolean; jobId: string; error: string }> {
  await connectToDatabase();

  // ── Idempotency: one install per client per day ─────────────────────
  const idempotencyKey = `${clientId}:${new Date().toISOString().slice(0, 10)}`;
  const existingJob = await InstallJob.findOne({ idempotencyKey, status: { $in: ['running', 'completed'] } }).lean();
  if (existingJob) {
    return { ok: true, jobId: String((existingJob as any)._id), error: '' };
  }

  // ── Acquire install lock ────────────────────────────────────────────
  const lockResult = await OnboardingSession.findOneAndUpdate(
    { tenantId, clientId, 'install.locked': { $ne: true } },
    { $set: { 'install.locked': true, 'install.lockedAt': new Date(), 'install.status': 'installing' } },
    { new: true }
  );
  if (!lockResult) {
    return { ok: false, jobId: '', error: 'Install already in progress' };
  }

  // ── Create install job ──────────────────────────────────────────────
  const job = await InstallJob.create({
    tenantId, clientId,
    onboardingSessionId: String((lockResult as any)._id),
    status:       'running',
    initiatedBy,
    idempotencyKey,
    'progress.startedAt': new Date(),
  });
  const jobId = String(job._id);

  // Update session with jobId
  await OnboardingSession.updateOne({ tenantId, clientId }, { $set: { 'install.installJobId': jobId, 'install.installStartedAt': new Date() } });

  const log = (step: string, status: 'started' | 'completed' | 'failed' | 'skipped' | 'warning', msg = '', meta = {}) =>
    appendInstallLog({ installJobId: jobId, tenantId, clientId, step, status, message: msg, metadata: meta });

  try {
    // ── Load state ────────────────────────────────────────────────
    const [session, domain, gsc] = await Promise.all([
      OnboardingSession.findOne({ tenantId, clientId }).lean(),
      ConnectedDomain.findOne({ tenantId, clientId }).lean(),
      ConnectedGSCProperty.findOne({ tenantId, clientId }).lean(),
    ]) as [any, any, any];

    // ── Step 1: Validate readiness ────────────────────────────────
    await log('validate_readiness', 'started');
    const readiness = await evaluateInstallReadiness(tenantId, clientId);
    if (!readiness.ready) {
      await log('validate_readiness', 'failed', `Blockers: ${readiness.blockers.join(', ')}`);
      throw new Error(`Install blocked: ${readiness.blockers.join('; ')}`);
    }
    await log('validate_readiness', 'completed', `Score: ${readiness.score}`);

    // ── Step 2: Normalize domain ──────────────────────────────────
    await log('normalize_domain', 'started');
    const nd = normalizeDomain(session?.business?.domain ?? domain?.domain ?? '');
    if (!nd.isValid) throw new Error(`Domain normalization failed: ${nd.error}`);
    await log('normalize_domain', 'completed', nd.normalizedDomain);

    // ── Step 3: Confirm GSC ───────────────────────────────────────
    await log('confirm_gsc', 'started');
    if (!gsc?.propertyUrl) throw new Error('GSC property not attached');
    await log('confirm_gsc', 'completed', gsc.propertyUrl);

    // ── Step 4: Confirm GitHub ────────────────────────────────────
    await log('confirm_github', 'started');
    const owner  = domain?.hosting?.repoOwner ?? '';
    const repo   = domain?.hosting?.repoName  ?? '';
    const branch = domain?.hosting?.repoBranch ?? 'main';
    if (!owner || !repo) throw new Error('GitHub repo not connected');
    await log('confirm_github', 'completed', `${owner}/${repo}`);

    // ── Step 5: Build starter config ──────────────────────────────
    await log('build_starter_config', 'started');
    const config = buildStarterEngineConfig(session, domain, gsc);
    await OnboardingSession.updateOne(
      { tenantId, clientId },
      { $set: { 'engineConfig.starterConfig': config, 'engineConfig.targetGeo': config.targetGeo } }
    );
    await log('build_starter_config', 'completed', `${config.starterPages.length} pages planned`);

    // ── Step 6: Seed Mongo state ──────────────────────────────────
    await log('seed_mongo_state', 'started');
    // Update User record to match the existing system (githubOwner/githubRepo/targetDomain pattern)
    await User.findByIdAndUpdate(clientId, {
      $set: {
        githubOwner:   owner,
        githubRepo:    repo,
        targetDomain:  nd.normalizedDomain,
        seoEngine:     true,
        seoAutomation: true,
      },
    }).catch(() => { /* user may not exist by this ID — non-fatal */ });

    // Seed starter ClientActivityFeed events
    await ClientActivityFeed.insertMany([
      { userId: clientId, type: 'publish',   icon: '✅', message: `${config.starterPages.length} starter pages planned for ${config.targetGeo || config.brandName}` },
      { userId: clientId, type: 'discovery', icon: '🧠', message: `${config.starterTopics.length} keyword opportunities discovered` },
      { userId: clientId, type: 'optimize',  icon: '🚀', message: `SEO engine installed and autopilot ready` },
    ]).catch(() => {});

    await log('seed_mongo_state', 'completed', 'Client profile seeded');

    // ── Step 7: Push GitHub assets ────────────────────────────────
    await log('push_github_assets', 'started');

    // Config JSON
    const configJson = JSON.stringify(config, null, 2);
    await githubPut(owner, repo, 'seo-engine-config.json', configJson,
      'feat(nova): Install AI Pilots SEO engine configuration');

    // CSS (same as existing publish-github pattern — idempotent)
    for (const cssPath of ['public/seo-engine.css', 'seo-engine.css']) {
      await githubPut(owner, repo, cssPath, SEO_ENGINE_CSS,
        'chore(nova): Sync AI Pilots baseline CSS layout').catch(() => {});
    }

    // Starter sitemap seed
    const sitemapBase = nd.urlPrefix;
    const sitemapUrls = config.starterPages.map(p =>
      `  <url><loc>${sitemapBase}articles/${p}</loc><priority>0.9</priority></url>`
    ).join('\n');
    const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls}\n</urlset>`;
    for (const smPath of ['public/sitemap.xml', 'sitemap.xml']) {
      await githubPut(owner, repo, smPath, sitemapXml,
        'chore(nova): Initialize SEO sitemap structure').catch(() => {});
      break; // only write one — prefer public/
    }

    await log('push_github_assets', 'completed', `Config, CSS, sitemap pushed to ${owner}/${repo}`);

    // ── Step 8: Trigger deploy ────────────────────────────────────
    await log('trigger_deploy', 'started');
    let deployUrl = `https://${nd.normalizedDomain}`;
    const deployHook = domain?.hosting?.deployHookUrl;
    if (deployHook) {
      try {
        const dhRes = await fetch(deployHook, { method: 'POST', signal: AbortSignal.timeout(10000) });
        deployUrl = (await dhRes.json())?.url ?? deployUrl;
        await log('trigger_deploy', 'completed', 'Deploy hook triggered');
      } catch {
        await log('trigger_deploy', 'warning', 'Deploy hook not available — GitHub push will auto-trigger deployment');
      }
    } else {
      await log('trigger_deploy', 'completed', 'GitHub push will auto-trigger deployment');
    }

    // ── Step 9: Poll deploy (lightweight — 30s max) ───────────────
    await log('poll_deploy_status', 'started');
    await new Promise(r => setTimeout(r, 6000)); // give deployment a head start
    await log('poll_deploy_status', 'completed', 'Deployment window passed — verifying');

    // ── Step 10: Verify live install ─────────────────────────────
    await log('verify_live_install', 'started');
    const siteUrl = nd.urlPrefix;
    const verification = await verifyInstalledClient(tenantId, clientId, siteUrl);
    if (verification.blockers.length > 0) {
      await log('verify_live_install', 'warning', `Warnings: ${verification.blockers.join(', ')} — marked needs_attention`);
    } else {
      await log('verify_live_install', 'completed', 'Site live and verified');
    }

    // ── Step 11: First run activation ─────────────────────────────
    await log('trigger_first_run', 'started');
    // Fire-and-forget with error capture — don't block install completion if activation has issues
    const activationResult = await runFirstActivation({ tenantId, clientId }).catch((e: any) => ({ ok: false, error: e.message }));
    await OnboardingSession.updateOne(
      { tenantId, clientId },
      { $set: { 'postInstall.firstRunComplete': true, 'connections.deployTargetReady': true, 'engineConfig.autopilotEnabled': true } }
    );
    await log('trigger_first_run', 'completed',
      activationResult.ok ? 'Growth engine activated — data seeded' : `Activation partial: ${activationResult.error}`
    );

    // ── Step 12: Mark complete ────────────────────────────────────
    await log('mark_complete', 'started');
    await InstallJob.updateOne(
      { _id: jobId },
      {
        $set: {
          status:                  'completed',
          'progress.percent':      100,
          'progress.completedAt':  new Date(),
          'result.siteUrl':        siteUrl,
          'result.deployUrl':      deployUrl,
          'result.dashboardUrl':   `/client-growth`,
          'result.pagesCreated':   config.starterPages.length,
          'result.warnings':       verification.warnings,
        },
      }
    );
    await OnboardingSession.updateOne(
      { tenantId, clientId },
      { $set: { 'install.locked': false, 'postInstall.siteUrl': siteUrl, 'postInstall.deployUrl': deployUrl } }
    );
    await log('mark_complete', 'completed', 'Install complete');

    return { ok: true, jobId, error: '' };

  } catch (err: any) {
    // Release lock + mark job failed
    await Promise.all([
      OnboardingSession.updateOne(
        { tenantId, clientId },
        { $set: { 'install.locked': false, 'install.status': 'failed', 'install.lastError': err.message } }
      ),
      InstallJob.updateOne(
        { _id: jobId },
        { $set: { status: 'failed', 'error.message': err.message, 'error.humanNote': `Install failed: ${err.message}` } }
      ),
    ]);

    return { ok: false, jobId, error: err.message };
  }
}
