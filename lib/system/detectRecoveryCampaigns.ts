/**
 * lib/system/detectRecoveryCampaigns.ts     — cluster triggers into campaign candidates
 * lib/system/createRecoveryCampaign.ts      — persist a new campaign
 * lib/system/assignPlaybooksToCampaign.ts   — assign playbooks to all scopes
 * lib/system/runRecoveryCampaign.ts         — execute campaign assignments
 * lib/system/shouldAbortCampaign.ts         — abort safety gate
 * lib/system/adjustCampaignStrategy.ts      — strategic coordination selector
 *
 * All in one file — they form a single logical layer.
 */
import connectToDatabase              from '@/lib/mongodb';
import AutonomousResponseTrigger      from '@/models/system/AutonomousResponseTrigger';
import AutonomousResponsePlaybook     from '@/models/system/AutonomousResponsePlaybook';
import AutonomousResponsePolicy       from '@/models/system/AutonomousResponsePolicy';
import { RecoveryCampaign, CampaignScopeAssignment } from '@/models/system/RecoveryCampaign';
import { selectAutonomousResponsePlaybook } from './selectAutonomousResponsePlaybook';
import { runAutonomousResponsePlaybook }    from './runAutonomousResponsePlaybook';

const CAMPAIGN_THRESHOLD  = parseInt(process.env.CAMPAIGN_TRIGGER_THRESHOLD ?? '5', 10);
const CAMPAIGN_BATCH_SIZE = parseInt(process.env.CAMPAIGN_BATCH_SIZE ?? '3', 10);

// ── 1. Detect ─────────────────────────────────────────────────────────────
export interface CampaignCandidate {
  anomalyType:     string;
  affectedScopes:  string[];
  affectedTenants: string[];
  severity:        number;  // 0..100
  strategy:        string;
}

export async function detectRecoveryCampaigns(): Promise<CampaignCandidate[]> {
  await connectToDatabase();
  const cutoff = new Date(Date.now() - 4 * 3_600_000);

  // Cluster open/planned triggers by triggerType in the past 4h
  const triggers = await AutonomousResponseTrigger.find({
    status:    { $in: ['open', 'planned'] },
    createdAt: { $gte: cutoff },
  }).lean() as any[];

  const grouped: Record<string, any[]> = {};
  for (const t of triggers) {
    if (!grouped[t.triggerType]) grouped[t.triggerType] = [];
    grouped[t.triggerType].push(t);
  }

  const candidates: CampaignCandidate[] = [];

  for (const [anomalyType, group] of Object.entries(grouped)) {
    if (group.length < CAMPAIGN_THRESHOLD) continue;

    // Skip if a campaign already exists for this anomalyType in the past 4h
    const existing = await RecoveryCampaign.findOne({
      anomalyType,
      status:    { $in: ['active', 'stabilizing'] },
      createdAt: { $gte: cutoff },
    }).lean();
    if (existing) continue;

    const scopes  = [...new Set(group.map(t => t.scopeKey).filter(Boolean))] as string[];
    const tenants = [...new Set(group.map(t => t.tenantId).filter(Boolean))] as string[];

    // Composite severity: proportion of critical/high triggers × 100
    const critCount = group.filter(t => t.severity === 'critical' || t.severity === 'high').length;
    const severity  = Math.round((critCount / group.length) * 100);

    candidates.push({
      anomalyType,
      affectedScopes:  scopes,
      affectedTenants: tenants,
      severity,
      strategy: adjustCampaignStrategy({ severity } as any),
    });
  }

  return candidates;
}

// ── 2. Strategy selector ──────────────────────────────────────────────────
export function adjustCampaignStrategy(campaign: { severity: number }): string {
  if (campaign.severity > 80) return 'sequential';      // safest — one scope at a time
  if (campaign.severity < 40) return 'batched';          // faster — parallel batches
  return 'priority_weighted';                            // default — severity order
}

// ── 3. Create ─────────────────────────────────────────────────────────────
export async function createRecoveryCampaign(data: CampaignCandidate): Promise<any> {
  await connectToDatabase();
  const campaignKey = `${data.anomalyType}::campaign::${Date.now()}`;
  const riskLevel   = data.severity > 80 ? 'critical' : data.severity > 50 ? 'high' : data.severity > 25 ? 'medium' : 'low';

  return RecoveryCampaign.create({
    campaignKey,
    anomalyType:          data.anomalyType,
    severity:             data.severity,
    affectedScopes:       data.affectedScopes,
    affectedTenants:      data.affectedTenants,
    assignedPlaybooks:    [],
    coordinationStrategy: data.strategy ?? 'priority_weighted',
    progress:             { completed: 0, total: data.affectedScopes.length || 1 },
    riskLevel,
    status:               'active',
  });
}

// ── 4. Assign playbooks ───────────────────────────────────────────────────
export async function assignPlaybooksToCampaign(campaign: any): Promise<void> {
  await connectToDatabase();
  const playbooks = await AutonomousResponsePlaybook.find({ enabled: true }).lean() as any[];
  const assignments = [];
  const assignedPlaybookKeys = new Set<string>();

  const scopes: string[] = campaign.affectedScopes ?? ['global'];

  for (let i = 0; i < scopes.length; i++) {
    const scopeKey = scopes[i];
    const playbook = selectAutonomousResponsePlaybook({
      triggerType:        campaign.anomalyType,
      scopeContext:       { anomalyType: campaign.anomalyType },
      availablePlaybooks: playbooks,
    });

    if (!playbook) continue;
    assignedPlaybookKeys.add(playbook.playbookKey);

    assignments.push({
      campaignKey:      campaign.campaignKey,
      scopeKey,
      tenantId:         campaign.affectedTenants[i] ?? null,
      assignedPlaybook: playbook.playbookKey,
      executionOrder:   i,
      status:           'pending',
    });
  }

  if (assignments.length) await CampaignScopeAssignment.insertMany(assignments);
  await RecoveryCampaign.updateOne({ campaignKey: campaign.campaignKey }, {
    $set: { assignedPlaybooks: [...assignedPlaybookKeys] },
  });
}

// ── 5. Abort gate ─────────────────────────────────────────────────────────
export async function shouldAbortCampaign(campaignKey: string): Promise<boolean> {
  await connectToDatabase();
  const campaign = await RecoveryCampaign.findOne({ campaignKey }).lean() as any;
  if (!campaign) return true;
  if (campaign.riskLevel === 'critical') return true;
  if (['operator_required', 'emergency'].includes(campaign.escalationState)) return true;

  // Check global freeze
  const freeze = await AutonomousResponsePolicy.findOne({ policyKey: 'global_freeze' }).lean() as any;
  if (freeze?.enabled === false) return true;

  return false;
}

// ── 6. Run campaign ───────────────────────────────────────────────────────
export async function runRecoveryCampaign(campaignKey: string): Promise<{ completed: number; failed: number; aborted: boolean }> {
  await connectToDatabase();

  const campaign = await RecoveryCampaign.findOne({ campaignKey }).lean() as any;
  if (!campaign) throw new Error(`Campaign not found: ${campaignKey}`);

  const assignments = await CampaignScopeAssignment.find({ campaignKey, status: 'pending' })
    .sort({ executionOrder: 1 }).lean() as any[];

  const allPlaybooks = await AutonomousResponsePlaybook.find({ enabled: true }).lean() as any[];

  let completed = 0;
  let failed   = 0;
  let batchIdx = 0;

  const strategy = campaign.coordinationStrategy ?? 'priority_weighted';

  // Group into batches by strategy
  const batches: any[][] = [];
  if (strategy === 'sequential') {
    batches.push(...assignments.map(a => [a]));
  } else if (strategy === 'batched') {
    for (let i = 0; i < assignments.length; i += CAMPAIGN_BATCH_SIZE) {
      batches.push(assignments.slice(i, i + CAMPAIGN_BATCH_SIZE));
    }
  } else {
    // priority_weighted — sort by scope severity proxy (executionOrder already reflects priority from assignPlaybooksToCampaign)
    batches.push(...assignments.map(a => [a]));
  }

  for (const batch of batches) {
    if (await shouldAbortCampaign(campaignKey)) {
      await RecoveryCampaign.updateOne({ campaignKey }, { $set: { status: 'aborted', abortReason: 'Safety gate triggered during campaign' } });
      return { completed, failed, aborted: true };
    }

    // Run batch in parallel
    await Promise.all(batch.map(async (assignment: any) => {
      const playbook = allPlaybooks.find((p: any) => p.playbookKey === assignment.assignedPlaybook);
      if (!playbook) { failed++; return; }

      const triggerStub = { triggerKey: `${campaignKey}::${assignment.scopeKey}`, triggerType: campaign.anomalyType, severity: campaign.riskLevel, scopeKey: assignment.scopeKey, tenantId: assignment.tenantId };

      try {
        await CampaignScopeAssignment.updateOne({ _id: assignment._id }, { $set: { status: 'running' } });
        const result = await runAutonomousResponsePlaybook({ trigger: triggerStub, playbook, campaignKey });

        const isSuccess = ['completed'].includes(result.status);
        await CampaignScopeAssignment.updateOne({ _id: assignment._id }, {
          $set: { status: isSuccess ? 'completed' : 'failed', runKey: result.runKey, result },
        });

        if (isSuccess) completed++; else failed++;
      } catch (err) {
        await CampaignScopeAssignment.updateOne({ _id: assignment._id }, { $set: { status: 'failed', failureReason: String(err) } });
        failed++;
      }
    }));

    await RecoveryCampaign.updateOne({ campaignKey }, { $set: { 'progress.completed': completed } });
    batchIdx++;
  }

  const finalStatus = failed > completed ? 'aborted' : completed > 0 ? 'resolved' : 'stabilizing';
  await RecoveryCampaign.updateOne({ campaignKey }, { $set: { status: finalStatus } });
  return { completed, failed, aborted: false };
}
