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

    const { userId, clusterId } = await req.json();
    if (!userId || !clusterId) {
      return NextResponse.json({ error: 'Missing parameters.' }, { status: 400 });
    }

    await connectToDatabase();
    
    // Natively extract the cluster node from the Mongoose array
    const result = await User.updateOne(
        { _id: userId },
        { $pull: { seoClusters: { _id: clusterId } } }
    );

    if (result.modifiedCount === 0) {
        return NextResponse.json({ error: 'Cluster not found or already deleted.' }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
    
  } catch (error: any) {
    console.error("[DELETE CLUSTER ERROR]", error);
    return NextResponse.json({ error: `Deletion crash: ${error.message}` }, { status: 500 });
  }
}
