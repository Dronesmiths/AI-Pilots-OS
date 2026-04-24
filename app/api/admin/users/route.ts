/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized. Emergency lock engaged.' }, { status: 401 });
    }

    const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev';
    
    // Verify the master admin signature
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as Record<string, any>;
      if (decoded.role !== 'superadmin') {
        throw new Error('Insufficient privileges');
      }
    } catch (e) {
      return NextResponse.json({ error: 'Invalid master key signature.' }, { status: 401 });
    }

    await connectToDatabase();

    // Fetch client list — explicitly exclude heavy arrays not needed by the UI.
    // seoClusters can contain hundreds of large objects — pulling them kills load time.
    const users = await User.find({})
      .select('-seoClusters -onboardingConfig -seoSettings -deployment -pageMetrics')
      .sort({ createdAt: -1 })
      .lean();

    // ----------------------------------------------------
    // AGGREGATE PER-USER TELEMETRY
    // ----------------------------------------------------
    const VAPI_API_KEY = process.env.VAPI_API_KEY;
    let allCalls: any[] = [];
    if (VAPI_API_KEY) {
      try {
        const vapiRes = await fetch('https://api.vapi.ai/call', {
          headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` },
          cache: 'no-store',
          signal: AbortSignal.timeout(5000), // never stall the dashboard > 5s
        });
        if (vapiRes.ok) {
          const vData = await vapiRes.json();
          allCalls = Array.isArray(vData) ? vData : (vData.data || []);
        }
      } catch (err) {
        // Timeout or network error — metrics degrade to zero, clients still load
        console.warn("[ADMIN USERS] Vapi fetch skipped (timeout or error):", (err as any)?.message);
      }
    }

    const usersWithMetrics = users.map((user: any) => {
      let totalCost = 0;
      let currentCycleCost = 0;
      let totalMinutes = 0;
      let currentCycleMinutes = 0;

      // Calculate the start of their current billing cycle based on join date anniversary
      const joinDate = user.createdAt ? new Date(user.createdAt) : new Date();
      const now = new Date();
      let billingStart = new Date(now.getFullYear(), now.getMonth(), joinDate.getDate());
      
      // If the anniversary is later this month, their current cycle started last month
      if (billingStart > now) {
        billingStart = new Date(now.getFullYear(), now.getMonth() - 1, joinDate.getDate());
      }

      if (user.vapiAgentId) {
        const userCalls = allCalls.filter(c => c.assistantId === user.vapiAgentId);
        
        userCalls.forEach(call => {
          const callDate = new Date(call.createdAt);
          const cost = call.cost || 0;
          
          let minutes = 0;
          if (call.endedAt && call.startedAt) {
            minutes = (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 60000;
          } else if (call.endedAt && call.createdAt) {
            minutes = (new Date(call.endedAt).getTime() - new Date(call.createdAt).getTime()) / 60000;
          }

          if (minutes > 0) {
            totalMinutes += minutes;
          }
          totalCost += cost;

          if (callDate >= billingStart) {
            currentCycleCost += cost;
            if (minutes > 0) currentCycleMinutes += minutes;
          }
        });
      }

      return {
        ...user,
        metrics: {
          totalCost: parseFloat(totalCost.toFixed(2)),
          currentCycleCost: parseFloat(currentCycleCost.toFixed(2)),
          totalMinutes: Math.round(totalMinutes),
          currentCycleMinutes: Math.round(currentCycleMinutes),
          billingStart: billingStart.toISOString()
        }
      };
    });

    return NextResponse.json({ success: true, users: usersWithMetrics });
  } catch (error: any) {
    console.error("[ADMIN USERS ERROR]", error.stack || error.message);
    return NextResponse.json({ error: `Metrics Calculation Crash: ${error.message}` }, { status: 500 });
  }
}
