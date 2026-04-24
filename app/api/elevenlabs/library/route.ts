import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('ai_pilots_client_session')?.value;

    if (!token) return NextResponse.json({ error: 'Unauthorized Session Vault' }, { status: 401 });

    const jwtSecret = process.env.JWT_SECRET || 'aipilots-temporary-secure-secret-2026';
    // Validate physical session token against brute force
    jwt.verify(token, jwtSecret);

    const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenLabsKey) {
        return NextResponse.json({ error: 'System API Key Missing inside Vercel' }, { status: 500 });
    }

    console.log('[VOICE LIBRARY] Executing physical GET extraction against ElevenLabs Master Database...');
    
    // Natively fetch the entire voice index bound to this specific developer account and the public tier
    const elResponse = await fetch('https://api.elevenlabs.io/v1/voices', {
      method: 'GET',
      headers: {
        'xi-api-key': elevenLabsKey
      }
    });

    if (!elResponse.ok) {
        throw new Error('ElevenLabs Engine rejected the strict REST extraction');
    }

    const rawData = await elResponse.json();
    
    // Mathematically filter the array to specifically return the exact payload required for React mapping
    const structuredVoices = rawData.voices.map((voice: any) => ({
      voice_id: voice.voice_id,
      name: voice.name,
      category: voice.category,
      labels: voice.labels,
      preview_url: voice.preview_url,
    }));

    return NextResponse.json({ success: true, voices: structuredVoices });
  } catch (error: any) {
    console.error("[VOICE LIBRARY] Fatal Systems Data Fetch Crash:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
