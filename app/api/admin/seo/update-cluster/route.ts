import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(req: Request) {
  try {
    const { clusterId, payload } = await req.json();

    if (!clusterId || !payload) {
      return NextResponse.json({ error: 'Missing clusterId or payload' }, { status: 400 });
    }

    await connectToDatabase();

    // Find the user holding this specific cluster
    const user = await User.findOne({ 'seoClusters._id': clusterId });

    if (!user) {
      return NextResponse.json({ error: 'Cluster not found' }, { status: 404 });
    }

    // Find the index of the cluster inside the user document
    const clusterIndex = user.seoClusters.findIndex(
      (c: any) => c._id.toString() === clusterId
    );

    if (clusterIndex === -1) {
      return NextResponse.json({ error: 'Cluster internally missing' }, { status: 404 });
    }

    // Merge the overriding payload directly into the cluster
    user.seoClusters[clusterIndex] = {
       ...user.seoClusters[clusterIndex],
       ...payload
    };

    // Auto-patch published dates if transitioning to Live
    if (payload.status === 'Live' && !user.seoClusters[clusterIndex].pushedAt) {
       user.seoClusters[clusterIndex].pushedAt = new Date();
    }

    await user.save();

    return NextResponse.json({ success: true, cluster: user.seoClusters[clusterIndex] });

  } catch (error: any) {
    console.error('[UPDATE CLUSTER ERROR]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
