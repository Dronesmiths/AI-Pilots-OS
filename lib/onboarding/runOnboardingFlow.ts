/**
 * lib/onboarding/runOnboardingFlow.ts
 *
 * Core onboarding orchestration.
 * Creates an entire tenant intelligence stack in one atomic sequence.
 *
 * Flow:
 *   1. Create/upsert Tenant record
 *   2. Apply default policies (threshold, alert, mitigation, mandate, domain)
 *   3. Create default portfolio
 *   4. Assign owner operator scope
 *   5. Seed initial data (resolution + simulation + anomaly + board memory)
 *   6. Mark tenant as onboarded
 *   7. Return { tenantId, portfolioKey, warRoomUrl }
 *
 * Plan → policy defaults:
 *   starter  → conservative: minROI 0.05, maxRisk 0.20, autonomy limited
 *   growth   → balanced:     minROI 0.07, maxRisk 0.30, autonomy assisted
 *   pro      → aggressive:   minROI 0.10, maxRisk 0.40, autonomy expanded
 *
 * Goal → mandate:
 *   grow_traffic         → growth
 *   increase_conversions → experiment
 *   stabilize            → preservation
 *   experiment           → experiment
 */
import connectToDatabase                from '@/lib/mongodb';
import Tenant                           from '@/models/Tenant';
import { NovaPortfolio }                from '@/models/enterprise/NovaPortfolio';
import { NovaDecisionThresholdPolicy }  from '@/models/boardroom/NovaDecisionThresholdPolicy';
import { NovaAlertPolicy }              from '@/models/boardroom/NovaAlertPolicy';
import { NovaMitigationPolicy }         from '@/models/boardroom/NovaMitigationPolicy';
import { NovaStrategicModeConfig }      from '@/models/boardroom/NovaStrategicModeConfig';
import { NovaStrategicResolution }      from '@/models/boardroom/NovaStrategicResolution';
import { NovaScenarioSimulation }       from '@/models/boardroom/NovaScenarioSimulation';
import { NovaAnomalyEvent }             from '@/models/boardroom/NovaAnomalyEvent';
import { NovaBoardMemory }              from '@/models/boardroom/NovaBoardMemory';
import { NovaOperatorScope }            from '@/models/tenancy/NovaOperatorScope';
import { NovaDecisionThresholdEvaluation } from '@/models/boardroom/NovaDecisionThresholdEvaluation';

export type OnboardingPlan = 'starter' | 'growth' | 'pro';
export type OnboardingGoal = 'grow_traffic' | 'increase_conversions' | 'stabilize' | 'experiment';

export interface OnboardingInput {
  tenantId:    string;
  name:        string;
  domain:      string;
  industry?:   string;
  plan:        OnboardingPlan;
  goal:        OnboardingGoal;
  operatorId:  string;
  agencyId?:   string;   // optional — null = platform-direct tenant
}

export interface OnboardingResult {
  tenantId:     string;
  portfolioKey: string;
  warRoomUrl:   string;
  settingsUrl:  string;
  steps:        { step: string; status: 'ok' | 'error'; detail?: string }[];
}

// ── Plan defaults ─────────────────────────────────────────────────────────────
const PLAN_THRESHOLD = {
  starter: {
    minExpectedROI: 0.05, minConfidence: 0.70, maxWorstCaseRisk: 0.20,
    autoApproveAboveConfidence: 0.92, requireHumanReviewBelowConfidence: 0.60,
    minSuccessRate: 0.65, minPrecedentStrength: 0.55,
    maxSingleVentureExposure: 0.35, maxDomainExposure: 0.40,
    maxAutoApprovedCapitalShift: 25, maxLowConfidenceExposure: 0.25,
  },
  growth: {
    minExpectedROI: 0.07, minConfidence: 0.65, maxWorstCaseRisk: 0.30,
    autoApproveAboveConfidence: 0.88, requireHumanReviewBelowConfidence: 0.55,
    minSuccessRate: 0.60, minPrecedentStrength: 0.50,
    maxSingleVentureExposure: 0.40, maxDomainExposure: 0.50,
    maxAutoApprovedCapitalShift: 50, maxLowConfidenceExposure: 0.30,
  },
  pro: {
    minExpectedROI: 0.10, minConfidence: 0.60, maxWorstCaseRisk: 0.40,
    autoApproveAboveConfidence: 0.85, requireHumanReviewBelowConfidence: 0.50,
    minSuccessRate: 0.55, minPrecedentStrength: 0.45,
    maxSingleVentureExposure: 0.50, maxDomainExposure: 0.60,
    maxAutoApprovedCapitalShift: 100, maxLowConfidenceExposure: 0.40,
  },
};

const PLAN_MITIGATION = {
  starter: {
    allowAutoReduceExposure: true, allowAutoPauseExecution: true,
    allowAutoReopenMonitoring: true, allowAutoDowngradeAutonomy: false,
    allowAutoBlockApprovals: false, allowAutoFreezeDomain: false,
    maxExposureReductionPct: 0.08, maxMitigationsPerDay: 5,
    minSeverityToMitigate: 'high', requireHumanApprovalForCritical: true,
  },
  growth: {
    allowAutoReduceExposure: true, allowAutoPauseExecution: true,
    allowAutoReopenMonitoring: true, allowAutoDowngradeAutonomy: false,
    allowAutoBlockApprovals: false, allowAutoFreezeDomain: false,
    maxExposureReductionPct: 0.12, maxMitigationsPerDay: 10,
    minSeverityToMitigate: 'high', requireHumanApprovalForCritical: false,
  },
  pro: {
    allowAutoReduceExposure: true, allowAutoPauseExecution: true,
    allowAutoReopenMonitoring: true, allowAutoDowngradeAutonomy: true,
    allowAutoBlockApprovals: false, allowAutoFreezeDomain: false,
    maxExposureReductionPct: 0.20, maxMitigationsPerDay: 20,
    minSeverityToMitigate: 'medium', requireHumanApprovalForCritical: false,
  },
};

const PLAN_ALERT = {
  starter: {
    roiDropThreshold: 0.15, riskSpikeThreshold: 0.10,
    concentrationRiskThreshold: 0.60, confidenceDriftThreshold: 0.15,
    executionStallHours: 12, minSeverityToAlert: 'medium',
  },
  growth: {
    roiDropThreshold: 0.20, riskSpikeThreshold: 0.15,
    concentrationRiskThreshold: 0.70, confidenceDriftThreshold: 0.20,
    executionStallHours: 24, minSeverityToAlert: 'medium',
  },
  pro: {
    roiDropThreshold: 0.25, riskSpikeThreshold: 0.20,
    concentrationRiskThreshold: 0.80, confidenceDriftThreshold: 0.25,
    executionStallHours: 48, minSeverityToAlert: 'low',
  },
};

const GOAL_MANDATE: Record<OnboardingGoal, string> = {
  grow_traffic:         'growth',
  increase_conversions: 'experiment',
  stabilize:            'preservation',
  experiment:           'experiment',
};

// ── Seed data templates per goal ─────────────────────────────────────────────
function buildSeedData(tenantId: string, portfolioKey: string, goal: OnboardingGoal) {
  const resolutionKey = `${tenantId}::initial-${goal.replace(/_/g,'-')}`;
  const simKey        = `${resolutionKey}::sim`;
  const now           = new Date();

  const goalLabels: Record<OnboardingGoal, { title: string; action: string; roi: number; risk: number; conf: number; summary: string }> = {
    grow_traffic:         { title:'Scale Organic Traffic Acquisition', action:'scale',    roi:0.14, risk:0.18, conf:0.78, summary:'Expand keyword targeting and content velocity to capture high-intent traffic clusters.' },
    increase_conversions: { title:'Conversion Rate Optimization Cycle', action:'optimize', roi:0.18, risk:0.22, conf:0.74, summary:'Run A/B test cycles on high-traffic landing pages to push conversion rate above baseline.' },
    stabilize:            { title:'Stabilization & Technical Audit',    action:'audit',    roi:0.08, risk:0.10, conf:0.85, summary:'Address core technical debt and performance gaps to establish a stable growth platform.' },
    experiment:           { title:'Experimental Content Framework',     action:'experiment',roi:0.22, risk:0.30, conf:0.68, summary:'Deploy a rapid experimentation cycle across emerging topic clusters to identify breakout opportunities.' },
  };

  const cfg = goalLabels[goal];

  const resolution = {
    resolutionKey,
    title:               cfg.title,
    recommendedAction:   cfg.action,
    portfolioKey,
    tenantId,
    status:              'approved',
    confidence:          cfg.conf,
    metadata: { source: 'onboarding_seed', summary: cfg.summary },
  };

  const simulation = {
    resolutionKey,
    tenantId,
    scenarios: [
      { label:'best',     roiChange: cfg.roi * 1.6, riskChange: cfg.risk * 0.7, confidence: 0.25, timeToImpact: 60 },
      { label:'expected', roiChange: cfg.roi,        riskChange: cfg.risk,       confidence: 0.55, timeToImpact: 90 },
      { label:'worst',    roiChange: cfg.roi * 0.2,  riskChange: cfg.risk * 1.5, confidence: 0.20, timeToImpact: 120 },
    ],
    aggregateScore:      cfg.roi * 0.9,
    precedentStrength:   0.62,
    simulationNotes:     `Auto-generated during onboarding for ${goal} goal.`,
  };

  const thresholdEval = {
    evaluationKey: `${resolutionKey}::threshold`,
    resolutionKey,
    tenantId,
    policyKey:     `resolved::${tenantId}::${portfolioKey}`,
    mandateApplied: GOAL_MANDATE[goal],
    expectedROI:    cfg.roi,
    worstCaseROI:   cfg.roi * 0.2,
    expectedRisk:   cfg.risk,
    worstCaseRisk:  cfg.risk * 1.4,
    confidence:     cfg.conf,
    precedentStrength: 0.62,
    successRate:    0.68,
    passed:         true,
    verdict:        'approve_for_vote' as const,
    reasons:        [],
    exposureViolations: [],
    executionMode:  'instant' as const,
    stagePlan:      [],
  };

  const anomaly = {
    anomalyKey:        `${tenantId}::onboarding::${now.toISOString().slice(0,10)}`,
    anomalyType:       'monitoring_gap' as const,
    severity:          'low' as const,
    scopeType:         'portfolio' as const,
    scopeKey:          portfolioKey,
    tenantId,
    title:             'Initial Monitoring Baseline',
    summary:           'Nova has begun monitoring this portfolio. First snapshot will be captured after the initial decision cycle.',
    recommendedAction: 'Run first simulation cycle from War Room.',
    status:            'open' as const,
    detectedAt:        now,
  };

  const boardMemory = {
    resolutionKey,
    tenantId,
    actionType:    cfg.action,
    outcomeScore:  0,         // will update after first real cycle
    measured:      false,
    metadata: { note: 'Onboarding seed entry — outcome measured after first real cycle.' },
  };

  return { resolution, simulation, thresholdEval, anomaly, boardMemory };
}

// ── Main flow ─────────────────────────────────────────────────────────────────
export async function runOnboardingFlow(input: OnboardingInput): Promise<OnboardingResult> {
  await connectToDatabase();

  const portfolioKey = `${input.tenantId}::primary`;
  const steps: OnboardingResult['steps'] = [];

  // ── 1. Create / upsert tenant ────────────────────────────────────────────
  try {
    await Tenant.updateOne(
      { tenantId: input.tenantId },
      { $setOnInsert: {
          tenantId: input.tenantId,
          name:     input.name,
          domain:   input.domain || `${input.tenantId}.example.com`,
          industry: input.industry ?? '',
          plan:     input.plan,
          goal:     input.goal,
          agencyId: input.agencyId ?? null,
          status:   'active',
          onboarded: false,
        },
      },
      { upsert: true }
    );
    steps.push({ step:'Create tenant', status:'ok' });
  } catch (e: any) {
    steps.push({ step:'Create tenant', status:'error', detail: e.message });
    throw new Error(`Tenant creation failed: ${e.message}`);
  }

  // ── 2. Apply default policies (all in parallel) ──────────────────────────
  try {
    const thresh = PLAN_THRESHOLD[input.plan];
    const mit    = PLAN_MITIGATION[input.plan];
    const alrt   = PLAN_ALERT[input.plan];
    const mode   = GOAL_MANDATE[input.goal];

    await Promise.all([
      NovaDecisionThresholdPolicy.updateOne(
        { tenantId: input.tenantId, portfolioKey: { $exists: false } },
        { $setOnInsert: { policyKey:`threshold::${input.tenantId}::tenant`, tenantId:input.tenantId, isEnabled:true, isDefault:false, scopeType:'portfolio', scopeKey:input.tenantId, mandateType:mode, ...thresh } },
        { upsert: true }
      ),
      NovaMitigationPolicy.updateOne(
        { tenantId: input.tenantId, portfolioKey: { $exists: false } },
        { $setOnInsert: { policyKey:`mitigation::${input.tenantId}::tenant`, tenantId:input.tenantId, isEnabled:true, isDefault:false, scopeType:'portfolio', scopeKey:input.tenantId, ...mit } },
        { upsert: true }
      ),
      NovaAlertPolicy.updateOne(
        { tenantId: input.tenantId, portfolioKey: { $exists: false } },
        { $setOnInsert: { policyKey:`alert::${input.tenantId}::tenant`, tenantId:input.tenantId, isEnabled:true, isDefault:false, scopeType:'portfolio', scopeKey:input.tenantId, ...alrt } },
        { upsert: true }
      ),
      NovaStrategicModeConfig.updateOne(
        { modeKey: `tenant::${input.tenantId}` },
        { $setOnInsert: { modeKey:`tenant::${input.tenantId}`, mode, tenantId:input.tenantId } },
        { upsert: true }
      ),
      NovaStrategicModeConfig.updateOne(
        { modeKey: `domainprotection::${input.tenantId}` },
        { $setOnInsert: { modeKey:`domainprotection::${input.tenantId}`, tenantId:input.tenantId, lockedDomains:[], reviewDomains:[], autonomousDomains:[] } },
        { upsert: true }
      ),
    ]);
    steps.push({ step:'Apply policies', status:'ok', detail: `plan=${input.plan}, mandate=${mode}` });
  } catch (e: any) {
    steps.push({ step:'Apply policies', status:'error', detail: e.message });
  }

  // ── 3. Create default portfolio ──────────────────────────────────────────
  try {
    await NovaPortfolio.updateOne(
      { portfolioKey },
      { $setOnInsert: {
          portfolioKey,
          tenantId:             input.tenantId,
          name:                 `${input.name} Primary Portfolio`,
          mandateType:          GOAL_MANDATE[input.goal],
          totalAllocatedCapital: input.plan === 'pro' ? 200 : input.plan === 'growth' ? 100 : 50,
          status:               'active',
        }
      },
      { upsert: true }
    );
    steps.push({ step:'Create portfolio', status:'ok', detail: portfolioKey });
  } catch (e: any) {
    steps.push({ step:'Create portfolio', status:'error', detail: e.message });
  }

  // ── 4. Assign operator scope ─────────────────────────────────────────────
  try {
    await NovaOperatorScope.updateOne(
      { operatorId: input.operatorId, tenantId: input.tenantId },
      { $setOnInsert: {
          operatorId: input.operatorId,
          tenantId:   input.tenantId,
          role:       'owner',
          portfolioKeys: [portfolioKey],
          capabilities: [
            'war_room.view','war_room.vote','war_room.mitigate',
            'war_room.override','war_room.configure','war_room.acknowledge',
          ],
          isActive: true,
        }
      },
      { upsert: true }
    );
    steps.push({ step:'Assign operator', status:'ok', detail: `operatorId=${input.operatorId}` });
  } catch (e: any) {
    steps.push({ step:'Assign operator', status:'error', detail: e.message });
  }

  // ── 5. Seed initial data ─────────────────────────────────────────────────
  try {
    const seed = buildSeedData(input.tenantId, portfolioKey, input.goal);

    await Promise.all([
      NovaStrategicResolution.updateOne(
        { resolutionKey: seed.resolution.resolutionKey },
        { $setOnInsert: seed.resolution },
        { upsert: true }
      ),
      NovaScenarioSimulation.updateOne(
        { resolutionKey: seed.simulation.resolutionKey },
        { $setOnInsert: seed.simulation },
        { upsert: true }
      ),
      NovaDecisionThresholdEvaluation.updateOne(
        { evaluationKey: seed.thresholdEval.evaluationKey },
        { $setOnInsert: seed.thresholdEval },
        { upsert: true }
      ),
      NovaAnomalyEvent.updateOne(
        { anomalyKey: seed.anomaly.anomalyKey },
        { $setOnInsert: seed.anomaly },
        { upsert: true }
      ),
      NovaBoardMemory.updateOne(
        { resolutionKey: seed.boardMemory.resolutionKey },
        { $setOnInsert: seed.boardMemory },
        { upsert: true }
      ),
    ]);
    steps.push({ step:'Seed initial data', status:'ok', detail: `goal=${input.goal}` });
  } catch (e: any) {
    steps.push({ step:'Seed initial data', status:'error', detail: e.message });
  }

  // ── 6. Mark tenant onboarded ─────────────────────────────────────────────
  try {
    await Tenant.updateOne({ tenantId: input.tenantId }, { $set: { onboarded: true } });
    steps.push({ step:'Activate tenant', status:'ok' });
  } catch (e: any) {
    steps.push({ step:'Activate tenant', status:'error', detail: e.message });
  }

  return {
    tenantId:     input.tenantId,
    portfolioKey,
    warRoomUrl:   `/admin/${input.tenantId}/war-room`,
    settingsUrl:  `/admin/${input.tenantId}/settings`,
    steps,
  };
}
