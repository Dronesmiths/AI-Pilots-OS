import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;

    if (!token) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev';
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as Record<string, any>;
      if (decoded.role !== 'superadmin') throw new Error('Insufficient privileges');
    } catch (e) {
      return NextResponse.json({ error: 'Invalid master key signature.' }, { status: 401 });
    }

    const { userId, clusterId, action } = await req.json();

    if (!userId || clusterId === undefined || !action) {
      return NextResponse.json({ error: 'Missing parameters.' }, { status: 400 });
    }

    await connectToDatabase();
    const user = await User.findById(userId);
    
    const cluster = user.seoClusters.id(clusterId);
    if (!cluster) {
      return NextResponse.json({ error: 'Cluster not found.' }, { status: 404 });
    }

    if (action === 'publish') {
      cluster.status = 'Live';
    } else if (action === 'fail') {
      cluster.status = 'Failed';
    }

    await user.save();
    return NextResponse.json({ success: true, message: `Cluster state updated to ${cluster.status}` });
    
  } catch (error: any) {
    console.error("[SEO PUBLISH ERROR]", error);
    return NextResponse.json({ error: `Publish Crash: ${error.message}` }, { status: 500 });
  }
}
