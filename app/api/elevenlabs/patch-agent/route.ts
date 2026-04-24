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
    if (!dbUser) return NextResponse.json({ error: 'Database Signature Map Failed' }, { status: 404 });

    const { voiceId } = await request.json();

    if (!voiceId) {
        return NextResponse.json({ error: 'No strict Voice ID string provided in parsing body' }, { status: 400 });
    }

    const vapiAgentId = dbUser.vapiAgentId;
    if (!vapiAgentId) {
        return NextResponse.json({ error: 'Client lacks structural Vapi Matrix allocation' }, { status: 400 });
    }

    console.log(`[VOICE PATCH] Structurally overriding Agent ${vapiAgentId} on Vapi Edge Servers with new explicit ElevenLabs ID: ${voiceId}`);

    const vapiRes = await fetch(`https://api.vapi.ai/assistant/${vapiAgentId}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            voice: {
                provider: '11labs',
                voiceId: voiceId
            }
        })
    });

    if (!vapiRes.ok) {
        const vapiErr = await vapiRes.text();
        console.error('[VOICE PATCH] Vapi Rejected the Syntax:', vapiErr);
        return NextResponse.json({ error: 'Vapi refused the new payload protocol' }, { status: vapiRes.status });
    }

    dbUser.elevenLabsVoiceId = voiceId;
    await dbUser.save();

    console.log(`[VOICE PATCH] Structural network override mathematically completed.`);
    return NextResponse.json({ success: true, voiceId });

  } catch (error: any) {
    console.error("[VOICE PATCH] Fatal Memory Exception:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
