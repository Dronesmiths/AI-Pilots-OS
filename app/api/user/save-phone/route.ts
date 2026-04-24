/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'aipilots-temporary-secure-secret-2026';

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('ai_pilots_client_session')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { phone } = await req.json();

    if (!phone || phone.length < 5) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    await connectToDatabase();
    
    // Find and physically patch the user document
    const userProfile = await User.findOne({ email: decoded.email.toLowerCase().trim() });
    if (!userProfile) {
      return NextResponse.json({ error: 'User not found in Database' }, { status: 404 });
    }

    userProfile.personalPhone = phone.trim();
    await userProfile.save();

    console.log(`[DASHBOARD API] Saved SMS routing number ${phone} for ${userProfile.email}`);
    
    return NextResponse.json({ success: true, message: 'Phone saved' });
  } catch (error: any) {
    console.error('Error saving personal phone:', error.message);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
