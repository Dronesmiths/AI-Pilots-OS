import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('ai_pilots_client_session')?.value;

    if (!token) return NextResponse.json({ error: 'Unauthorized Header Signature' }, { status: 401 });

    const jwtSecret = process.env.JWT_SECRET || 'aipilots-temporary-secure-secret-2026';
    const decoded = jwt.verify(token, jwtSecret) as any;

    await connectToDatabase();
    const dbUser = await User.findOne({ email: decoded.email.toLowerCase().trim() });
    if (!dbUser) return NextResponse.json({ error: 'User explicitly missing from central cluster' }, { status: 404 });

    // Safely extract the physical multi-part audio chunk explicitly transmitted from MediaRecorder
    const formData = await request.formData();
    const voiceFile = formData.get('voiceFile') as Blob;
    
    if (!voiceFile) {
        return NextResponse.json({ error: 'No audio stream mathematically provided in the payload' }, { status: 400 });
    }

    const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenLabsKey) {
        return NextResponse.json({ error: 'System API Key Missing inside Vercel' }, { status: 500 });
    }

    // 1. Instigate Outbound Multi-Part Upload natively to ElevenLabs Master Core
    const elevenFormData = new FormData();
    elevenFormData.append('name', `${dbUser.name} Custom Clone`);
    elevenFormData.append('files', voiceFile, 'voice_sample.webm'); 
    elevenFormData.append('description', `Automated dashboard injection for ${dbUser.email}`);

    console.log('[VOICE CLONE] Aggressively transmitting physical audio buffer to ElevenLabs API...');
    
    const elResponse = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsKey
      },
      // Do not manually set Content-Type header to multipart/form-data. Node Fetch natively binds boundary bounds correctly.
      body: elevenFormData
    });

    if (!elResponse.ok) {
        const errText = await elResponse.text();
        console.error('[VOICE CLONE] ElevenLabs Syntax Error:', errText);
        return NextResponse.json({ error: 'ElevenLabs Voice Generation Engine violently rejected the payload' }, { status: elResponse.status });
    }

    const elData = await elResponse.json();
    const newVoiceId = elData.voice_id;

    console.log(`[VOICE CLONE] Success Blueprint! Received Voice ID Matrix: ${newVoiceId}`);

    // 2. Automate Outbound Vapi Patch Request to instantly sync voice signature
    const vapiAgentId = dbUser.vapiAgentId;
    if (vapiAgentId) {
        console.log(`[VOICE CLONE] Patching Live Vapi Agent ${vapiAgentId} structurally with new Voice Profile...`);
        const vapiRes = await fetch(`https://api.vapi.ai/assistant/${vapiAgentId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                voice: {
                    provider: '11labs',
                    voiceId: newVoiceId
                }
            })
        });

        if (!vapiRes.ok) {
            console.error('[VOICE CLONE] Vapi Database Binding Error:', await vapiRes.text());
        } else {
            console.log(`[VOICE CLONE] Successfully natively ported the new cloned voice safely over to Vapi Hub.`);
        }
    }

    // 3. Systematically log the new Voice ID deeply into MongoDB forever
    dbUser.elevenLabsVoiceId = newVoiceId;
    await dbUser.save();

    return NextResponse.json({ success: true, voiceId: newVoiceId });
  } catch (error: any) {
    console.error("[VOICE CLONE] Fatal Runtime System Crash:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
