import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;

    if (!token) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    
    const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev';
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as Record<string, any>;
      if (decoded.role !== 'superadmin') throw new Error('Insufficient privileges');
    } catch {
      return NextResponse.json({ error: 'Invalid master signature.' }, { status: 401 });
    }

    const body = await request.json();
    const { targetLatitude, targetLongitude } = body;

    await connectToDatabase();
    
    const updatedUser = await User.findByIdAndUpdate(
      params.id,
      { $set: { targetLatitude, targetLongitude } },
      { new: true, lean: true }
    );

    if (!updatedUser) {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    }

    console.log(`[EXIF PROXIMITY] GPS Coordinates updated for ${updatedUser.name}: `, targetLatitude, targetLongitude);
    
    return NextResponse.json({ success: true, targetLatitude: updatedUser.targetLatitude, targetLongitude: updatedUser.targetLongitude });
  } catch (error: any) {
    console.error("[GPS PATCH ERROR]", error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
