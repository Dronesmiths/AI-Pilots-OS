import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('ai_pilots_client_session')?.value;

    if (!token) return NextResponse.json({ error: 'Unauthorized Session' }, { status: 401 });

    const jwtSecret = process.env.JWT_SECRET || 'aipilots-temporary-secure-secret-2026';
    const decoded = jwt.verify(token, jwtSecret) as any;

    await connectToDatabase();
    const dbUser = await User.findOne({ email: decoded.email.toLowerCase().trim() });
    
    if (!dbUser) return NextResponse.json({ error: 'Database Signature Maps Failed' }, { status: 404 });

    const { action, voiceId, name, preview_url } = await request.json();

    if (!voiceId) {
        return NextResponse.json({ error: 'No strict Voice ID string provided' }, { status: 400 });
    }

    if (!dbUser.favoriteVoices) {
        dbUser.favoriteVoices = [];
    }

    // Mathematical Ledger Toggle Engine
    if (action === 'add') {
        const alreadyExists = dbUser.favoriteVoices.some((v: any) => v.voiceId === voiceId);
        if (!alreadyExists) {
            dbUser.favoriteVoices.push({ voiceId, name, preview_url });
        }
    } else if (action === 'remove') {
        dbUser.favoriteVoices = dbUser.favoriteVoices.filter((v: any) => v.voiceId !== voiceId);
    }

    await dbUser.save();

    return NextResponse.json({ success: true, favoriteVoices: dbUser.favoriteVoices });

  } catch (error: any) {
    console.error("[FAVORITE VOICES] Fatal Memory Exception:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
