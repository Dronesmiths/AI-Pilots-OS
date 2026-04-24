/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
 
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev';
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as Record<string, any>;
      if (decoded.role !== 'superadmin') throw new Error('Insufficient privileges');
    } catch {
      return NextResponse.json({ error: 'Invalid master signature.' }, { status: 401 });
    }

    await connectToDatabase();
    const user = await User.findById(params.id).lean();
    
    if (!user) {
      return NextResponse.json({ error: 'Client not found in database.' }, { status: 404 });
    }

    // Natively fetch specific call logs and Assistant Config for this Vapi Agent ID
    let userCalls: any[] = [];
    let assistantConfig: any = null;
    const VAPI_API_KEY = process.env.VAPI_API_KEY;
    
    if (VAPI_API_KEY && user.vapiAgentId && user.vapiAgentId !== 'None') {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);

        const [vapiRes, astRes] = await Promise.all([
          fetch(`https://api.vapi.ai/call?assistantId=${user.vapiAgentId}&limit=50`, { headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` }, signal: controller.signal }),
          fetch(`https://api.vapi.ai/assistant/${user.vapiAgentId}`, { headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` }, signal: controller.signal })
        ]);
        
        clearTimeout(timeoutId);
        
        if (vapiRes.ok) {
          const fetchedCalls = await vapiRes.json();
          userCalls = Array.isArray(fetchedCalls) ? fetchedCalls.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : [];
        }
        
        if (astRes.ok) {
          assistantConfig = await astRes.json();
        }
      } catch (err) {
        console.error("Vapi call sync failed gracefully:", err);
      }
    }

    console.log("SENDING NATIVE NEXTJS API USER:", JSON.stringify(user.onboardingConfig));
    return NextResponse.json({ success: true, user, calls: userCalls, assistant: assistantConfig });
  } catch (error: any) {
    console.error("[ADMIN USER API ERROR]", error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// 🚀 God-Mode Vapi Prompt Injection Router & User Settings Update
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
    const { 
        masterSystemPrompt, 
        brandTheme, 
        githubRepo, 
        githubOwner,
        ga4PropertyId,
        gmbAccountId,
        gmbLocationId,
        googleAdsCustomerId,
        dataForSeoLogin,
        dataForSeoPassword,
        pageBuilderTemplates,
        pageSpeedApiKey,
        cloudflareAccountId,
        cloudflareApiToken,
        dailyPageProductionLimit,
        targetServiceAreas,
        seoAutomation,
        llmQAAutomation,
        targetDomain,
        seoClusters,
        onboardingConfig
    } = body;

    await connectToDatabase();
    const user = await User.findById(params.id);
    if (!user) return NextResponse.json({ error: 'Client not found.' }, { status: 404 });

    // Update simple fields if provided
    let isUpdated = false;
    if (brandTheme !== undefined) { user.brandTheme = brandTheme; isUpdated = true; }
    if (githubRepo !== undefined) { user.githubRepo = githubRepo; isUpdated = true; }
    if (githubOwner !== undefined) { user.githubOwner = githubOwner; isUpdated = true; }
    if (targetDomain !== undefined) { user.targetDomain = targetDomain; user.seoEngine = targetDomain; isUpdated = true; }
    if (ga4PropertyId !== undefined) { user.ga4PropertyId = ga4PropertyId; isUpdated = true; }
    if (gmbAccountId !== undefined) { user.gmbAccountId = gmbAccountId; isUpdated = true; }
    if (gmbLocationId !== undefined) { user.gmbLocationId = gmbLocationId; isUpdated = true; }
    if (googleAdsCustomerId !== undefined) { user.googleAdsCustomerId = googleAdsCustomerId; isUpdated = true; }
    if (dataForSeoLogin !== undefined) { user.dataForSeoLogin = dataForSeoLogin; isUpdated = true; }
    if (dataForSeoPassword !== undefined) { user.dataForSeoPassword = dataForSeoPassword; isUpdated = true; }
    if (pageSpeedApiKey !== undefined) { user.pageSpeedApiKey = pageSpeedApiKey; isUpdated = true; }
    if (cloudflareAccountId !== undefined) { user.cloudflareAccountId = cloudflareAccountId; isUpdated = true; }
    if (cloudflareApiToken !== undefined) { user.cloudflareApiToken = cloudflareApiToken; isUpdated = true; }
    if (pageBuilderTemplates !== undefined) { user.pageBuilderTemplates = pageBuilderTemplates; isUpdated = true; }
    if (dailyPageProductionLimit !== undefined) { user.dailyPageProductionLimit = dailyPageProductionLimit; isUpdated = true; }
    if (targetServiceAreas !== undefined) { 
        user.set('targetServiceAreas', Array.isArray(targetServiceAreas) ? targetServiceAreas : targetServiceAreas.split(',').map((s: string) => s.trim())); 
        user.markModified('targetServiceAreas');
        isUpdated = true; 
    }
    if (seoAutomation !== undefined) { user.seoAutomation = seoAutomation; isUpdated = true; }
    if (llmQAAutomation !== undefined) { user.llmQAAutomation = llmQAAutomation; isUpdated = true; }
    if (seoClusters !== undefined) { 
        user.set('seoClusters', seoClusters);
        user.markModified('seoClusters');
        isUpdated = true; 
    }
    if (onboardingConfig !== undefined) { 
        user.set('onboardingConfig', onboardingConfig);
        user.markModified('onboardingConfig');
        isUpdated = true; 
    }

    if (isUpdated) {
      try {
        await user.save({ validateBeforeSave: false });
      } catch (saveErr: any) {
        console.error('[USER PATCH SAVE ERROR]', saveErr.message, saveErr.errors);
        return NextResponse.json({ error: `DB save failed: ${saveErr.message}` }, { status: 500 });
      }
    }

    // If a prompt override is provided, deploy it to the Vapi Engine
    if (masterSystemPrompt) {
      if (!user.vapiAgentId) return NextResponse.json({ error: 'Client Agent ID not found for prompt patch.' }, { status: 404 });

      console.log(`[GOD-MODE] Patching Agent ${user.vapiAgentId} for Admin...`);
      
      const vapiResponse = await axios.patch(`https://api.vapi.ai/assistant/${user.vapiAgentId}`, {
        model: {
          provider: "openai",
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: masterSystemPrompt }]
        }
      }, {
        headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` }
      });
    }

    return NextResponse.json({ success: true, message: 'Client updated successfully!' });
  } catch (error: any) {
    console.error("[GOD-MODE API ERROR]", error.response?.data || error.message);
    return NextResponse.json({ error: error.response?.data?.message || error.message || 'Failed to update client profile.' }, { status: 500 });
  }
}
