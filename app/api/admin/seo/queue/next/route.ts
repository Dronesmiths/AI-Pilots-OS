import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

// Simple API for the EC2 drone to ask: "What should I work on right now?"
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.JWT_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized Drone' }, { status: 401 });
    }

    await connectToDatabase();
    const now = new Date();

    // Find all users who have automation enabled (or just check all users)
    const users = await User.find({ "seoClusters": { $exists: true, $not: { $size: 0 } } });

    let targetJob = null;
    let targetUserId = null;

    // Look for the oldest scheduled item that is due NOW across all tenants
    for (const user of users) {
      const dueClusters = user.seoClusters.filter((c: any) => 
        c.status === 'queued' && 
        c.scheduledTime && 
        new Date(c.scheduledTime).getTime() <= now.getTime()
      );

      if (dueClusters.length > 0) {
        // Sort by oldest scheduled time first
        dueClusters.sort((a: any, b: any) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
        
        targetJob = dueClusters[0];
        targetUserId = user._id;
        break; // Found a job, break out and send it to the drone
      }
    }

    if (!targetJob) {
      return NextResponse.json({ message: 'No jobs due at this time.' }, { status: 200 });
    }

    // Return the exact payload the drone needs to execute the next steps
    return NextResponse.json({
      job: {
        userId: targetUserId.toString(),
        clusterId: targetJob._id.toString(),
        keyword: targetJob.keyword,
        category: targetJob.category || 'unknown',
        isLlmQA: targetJob.isLlmQA || false,
        scheduledTime: targetJob.scheduledTime
      }
    }, { status: 200 });

  } catch (error: any) {
    console.error("[QUEUE NEXT ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
