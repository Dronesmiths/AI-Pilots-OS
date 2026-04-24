import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import MarketInsight from '@/models/MarketInsight';
import User from '@/models/User';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    
    // Admin explicit verification check
    const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev';
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as Record<string, any>;
      if (decoded.role !== 'superadmin') throw new Error('Insufficient privileges');
    } catch {
      return NextResponse.json({ error: 'Invalid master signature.' }, { status: 401 });
    }

    await connectToDatabase();
    
    // Formally grab all 'pending' (unapproved) market anomalies and inject the nested client domain logic
    const insights = await MarketInsight.find({ status: 'pending' })
      .populate('user', 'name targetDomain email')
      .sort({ confidence_score: -1, createdAt: -1 })
      .lean();

    return NextResponse.json({ insights });
  } catch (error: any) {
    console.error("[GSC INSIGHTS] Error querying expansion backlog:", error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
