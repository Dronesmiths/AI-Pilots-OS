/**
 * lib/dashboard/systemStatus.ts
 *
 * Quick system health snapshot for a tenant.
 * Used by /api/dashboard/status and the SystemStatus UI component.
 *
 * Uses Mongoose models directly (not getMongo() which doesn't exist).
 * Queries QueueJob (new clean model) + drone_logs collection.
 */
import connectToDatabase from '@/lib/mongodb';
import QueueJob          from '@/models/QueueJob';
import EngineState       from '@/models/EngineState';
import mongoose          from 'mongoose';

export interface SystemStatusResult {
  systemLive:    boolean;
  engineReady:   boolean;
  jobsQueued:    number;
  jobsRunning:   number;
  lastAction:    string | null;
  strategyMode:  string;
}

export async function getSystemStatus(tenantId: string): Promise<SystemStatusResult> {
  await connectToDatabase();

  const [jobsQueued, jobsRunning, engine] = await Promise.all([
    QueueJob.countDocuments({ tenantId, status: 'queued' }),
    QueueJob.countDocuments({ tenantId, status: 'running' }),
    EngineState.findOne({ tenantId }).select('status strategyMode').lean(),
  ]);

  // Last drone log for this tenant
  const db = mongoose.connection.db;
  const lastLog = db
    ? await db.collection('drone_logs')
        .find({ tenantId })
        .sort({ createdAt: -1 })
        .limit(1)
        .toArray()
    : [];

  return {
    systemLive:   !!(engine),
    engineReady:  (engine as any)?.status === 'ready',
    jobsQueued,
    jobsRunning,
    lastAction:   lastLog[0]?.createdAt?.toISOString() ?? null,
    strategyMode: (engine as any)?.strategyMode ?? 'growth',
  };
}
