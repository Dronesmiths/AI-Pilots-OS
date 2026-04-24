/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'aipilots-temporary-secure-secret-2026';
const VAPI_API_KEY = process.env.VAPI_API_KEY;

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('ai_pilots_client_session')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, any>;
    
    // 🚀 NEW: Always connect to MongoDB to fetch the absolute truth for the session!
    await connectToDatabase();
    let userProfile = await User.findOne({ email: decoded.email.toLowerCase().trim() });
    
    if (!userProfile && decoded.email && decoded.vapiAgentId) {
      userProfile = await User.create({
        email: decoded.email.toLowerCase().trim(),
        name: decoded.name || 'Legacy Client',
        twilioNumber: decoded.twilioNumber || '+10000000000',
        vapiAgentId: decoded.vapiAgentId
      });
    }

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile missing from Database.' }, { status: 404 });
    }

    const vapiAgentId = userProfile.vapiAgentId;

    let agentFormData = null;
    if (vapiAgentId) {
      try {
        const vapiRes = await axios.get(`https://api.vapi.ai/assistant/${vapiAgentId}`, {
          headers: { Authorization: `Bearer ${VAPI_API_KEY}` }
        });
        
        // Extract strictly the synced UI configuration logic
        if (vapiRes.data.metadata?.rawFormState) {
          agentFormData = vapiRes.data.metadata.rawFormState;
        }
      } catch (err) {
        console.error("Hydration Error: Failed to load Vapi agent metadata.", err);
      }
    }

    return NextResponse.json({
      twilioNumber: userProfile.twilioNumber,
      name: userProfile.name,
      email: userProfile.email,
      agentFormData
    });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }
}
