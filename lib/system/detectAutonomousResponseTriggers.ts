/**
 * lib/system/detectAutonomousResponseTriggers.ts
 *
 * Pure function — scans live dashboard signals and emits trigger descriptors.
 * Called by runAutonomousResponseCycle with the latest MetaGovernorSnapshot.
 *
 * Returns trigger descriptors (not DB records — the orchestrator persists them).
 * Thresholds are calibrated to avoid over-triggering on normal system noise.
 */

export interface TriggerDescriptor {
  triggerType:    string;
  severity:       'low' | 'medium' | 'high' | 'critical';
  scopeKey?:      string | null;
  scopeFamily?:   string | null;
  tenantId?:      string | null;
  metrics:        Record<string, any>;
}

export function detectAutonomousResponseTriggers(input: {
  dashboard: {
    systemHealth:   any;
    authorityStats: any;
    conflictStats:  any;
    rollbackRisks:  any[];
    replaySignals:  any;
    weightProfiles?: any[];
  };
}): TriggerDescriptor[] {
  const triggers: TriggerDescriptor[] = [];
  const { systemHealth, authorityStats, conflictStats, rollbackRisks, replaySignals } = input.dashboard;

  // ── 1. Decision pipeline anomalies ───────────────────────────────────────

  // Arbitration is touching >45% of decisions — planner/policy alignment problem
  if ((authorityStats?.arbitrationRate ?? 0) > 0.45) {
    triggers.push({
      triggerType: 'arbitration_spike', severity: 'medium',
      metrics: { arbitrationRate: authorityStats.arbitrationRate, threshold: 0.45 },
    });
  }

  // More than 25% of decisions are blocked — governance is too restrictive or broken
  if ((systemHealth?.blockedRate ?? 0) > 0.25) {
    const severity = systemHealth.blockedRate > 0.5 ? 'high' : 'medium';
    triggers.push({
      triggerType: 'blocked_rate_spike', severity,
      metrics: { blockedRate: systemHealth.blockedRate, threshold: 0.25 },
    });
  }

  // Execution rate below 40% — pipeline is struggling
  if ((systemHealth?.executionRate ?? 1) < 0.40) {
    triggers.push({
      triggerType: 'execution_failure_spike', severity: 'high',
      metrics: { executionRate: systemHealth.executionRate, threshold: 0.40 },
    });
  }

  // ── 2. Governance anomalies ───────────────────────────────────────────────

  // Operator overrides exceeding 30% of decisions — operator may be compensating for bad system behavior
  if ((authorityStats?.operatorOverrideRate ?? 0) > 0.30) {
    const severity = authorityStats.operatorOverrideRate > 0.5 ? 'high' : 'medium';
    triggers.push({
      triggerType: 'override_spike', severity,
      metrics: { overrideRate: authorityStats.operatorOverrideRate, threshold: 0.30 },
    });
  }

  // High conflict density — many scopes are fighting between sources
  if ((conflictStats?.conflictDensity ?? 0) > 0.30) {
    triggers.push({
      triggerType: 'arbitration_spike', severity: 'high',
      metrics: { conflictDensity: conflictStats.conflictDensity, highConflictScopes: conflictStats.highConflictScopes?.length },
    });
  }

  // ── 3. Weight and learning anomalies ─────────────────────────────────────

  // Any active weight profile with critical rollback risk
  for (const risk of rollbackRisks ?? []) {
    if ((risk.rollbackScore ?? 0) >= 70) {
      triggers.push({
        triggerType: 'weight_rollback_risk',
        severity: risk.rollbackScore >= 85 ? 'critical' : 'high',
        scopeKey: risk.profileKey ?? null,
        metrics: { ...risk },
      });
    }
  }

  // Replay variants are consistently beating live behavior — live weights are wrong
  if ((replaySignals?.improvementRate ?? 0) > 0.35) {
    const severity = replaySignals.improvementRate > 0.6 ? 'high' : 'medium';
    triggers.push({
      triggerType: 'replay_disagreement_cluster', severity,
      metrics: {
        improvementRate:  replaySignals.improvementRate,
        topSignals:       replaySignals.topSignals,
        pendingUpdates:   replaySignals.pendingUpdates,
      },
    });
  }

  // High health score degradation (composite)
  if ((systemHealth?.healthScore ?? 100) < 50) {
    triggers.push({
      triggerType: 'confidence_drift',
      severity: systemHealth.healthScore < 30 ? 'critical' : 'high',
      metrics: { healthScore: systemHealth.healthScore, threshold: 50 },
    });
  }

  return triggers;
}
