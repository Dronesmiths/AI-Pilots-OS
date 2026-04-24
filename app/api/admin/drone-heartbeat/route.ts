/**
 * app/api/admin/drone-heartbeat/route.ts
 *
 * POST — EC2 drones ping this after every run cycle
 * GET  — War Room reads all heartbeats (used by upcoming route to replace inferred lastSeen)
 *
 * Security: requires DRONE_API_KEY bearer token (same key already used by crmClient.ts)
 */
import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase              from '@/lib/mongodb';
import { DroneHeartbeat }             from '@/models/DroneHeartbeat';

function authorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  const key  = process.env.DRONE_API_KEY || '';
  // Key present + matches — OR key not configured (dev mode)
  if (!key) return true;
  return auth === `Bearer ${key}`;
}

// ── POST /api/admin/drone-heartbeat ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!authorized(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const {
    drone,
    status       = 'ok',
    jobsProcessed= 0,
    queueDepth   = 0,
    lastJobState = null,
    host         = '',
    version      = '',
    lastError    = null,
    timestamp    = Date.now(),
  } = body;

  if (!drone)
    return NextResponse.json({ error: 'drone name required' }, { status: 400 });

  await connectToDatabase();

  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  await DroneHeartbeat.findOneAndUpdate(
    { drone },
    {
      $set: {
        status,
        lastHeartbeatAt: new Date(timestamp),
        queueDepth,
        lastJobState,
        host,
        version,
        lastError: status === 'error' ? lastError : null,
      },
      $inc: { jobsProcessed: jobsProcessed },
    },
    { upsert: true, new: true }
  );

  // Reset daily counter if date rolled over
  await DroneHeartbeat.updateOne(
    { drone, jobsTodayDate: { $ne: todayStr } },
    { $set: { jobsToday: jobsProcessed, jobsTodayDate: todayStr } }
  );
  await DroneHeartbeat.updateOne(
    { drone, jobsTodayDate: todayStr },
    { $inc: { jobsToday: jobsProcessed } }
  );

  return NextResponse.json({ ok: true, drone, receivedAt: new Date().toISOString() });
}

// ── GET /api/admin/drone-heartbeat ──────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!authorized(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectToDatabase();
  const beats = await DroneHeartbeat.find({}).lean();

  // Return as a map: drone name → heartbeat doc (easy lookup in upcoming route)
  const byDrone: Record<string, any> = {};
  for (const b of beats as any[]) {
    byDrone[b.drone] = {
      status:          b.status,
      lastHeartbeatAt: b.lastHeartbeatAt,
      jobsProcessed:   b.jobsProcessed,
      jobsToday:       b.jobsToday,
      host:            b.host,
      lastError:       b.lastError,
    };
  }

  return NextResponse.json({ beats: byDrone, asOf: new Date().toISOString() });
}
