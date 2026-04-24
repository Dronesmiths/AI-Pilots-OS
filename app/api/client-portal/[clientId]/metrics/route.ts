import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import Lead from '@/models/Lead';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params;

    await connectToDatabase();

    const clientDoc = await User.findById(clientId).lean();
    if (!clientDoc) {
      return NextResponse.json({ error: 'Client vector physically missing from Ledger.' }, { status: 404 });
    }

    // Determine the isolated agent ID map.
    let agentId = clientDoc.vapiAgentId || clientDoc.agentId;
    if (!agentId && clientDoc.agents && clientDoc.agents.length > 0) {
      agentId = clientDoc.agents[0].vapiAgentId;
    }

    const clientPayload = {
      name: clientDoc.name || clientDoc.email,
      email: clientDoc.email,
      phone: clientDoc.phone || clientDoc.personalPhone || 'Unmapped'
    };

    if (!agentId) {
      // If the client has no voice agent mapped at all, return valid empty metrics.
      return NextResponse.json({ 
        success: true, 
        client: clientPayload,
        metrics: { totalCalls: 0, completedCalls: 0, totalMinutes: 0 },
        recentLeads: []
      });
    }

    const VAPI_API_KEY = process.env.VAPI_API_KEY;
    if (!VAPI_API_KEY) {
      return NextResponse.json({ error: 'Vapi key missing.' }, { status: 500 });
    }

    // Ping the global Vapi ledger
    const vapiRes = await fetch('https://api.vapi.ai/call', { 
      headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` } 
    });
    
    if (!vapiRes.ok) throw new Error('Failed to securely query Vapi cluster.');
    const allCalls = await vapiRes.json();

    // Aggressively isolate strictly to this client's agent scope.
    const clientCalls = allCalls.filter((c: any) => c.assistantId === agentId);
    
    let totalMinutes = 0;
    let completedCalls = 0;

    clientCalls.forEach((c: any) => {
      if (c.endedReason === 'customer-ended-call' || c.endedReason === 'assistant-ended-call') {
        completedCalls += 1;
      }
      const started = new Date(c.createdAt).getTime();
      const ended = new Date(c.endedAt || c.updatedAt).getTime();
      const minutes = (ended - started) / 1000 / 60;
      if (minutes > 0) totalMinutes += minutes;
    });

    const dbLeads = await Lead.find({}).lean();
    const crmStatusMap: Record<string, any> = {};
    dbLeads.forEach((l: any) => { crmStatusMap[l.vapiCallId] = l; });

    // Filter recent leads
    const recentLeads = clientCalls
      .filter((c: any) => c.analysis?.structuredData?.is_lead)
      .map((c: any) => ({
        id: c.id,
        summary: c.analysis?.summary || 'No structured analysis available.',
        number: c.customer?.number || 'Unknown',
        transcript: c.transcript || '',
        crmStatus: crmStatusMap[c.id]?.crmStatus || 'New'
      }))
      .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 5); // Return only the last 5 hot leads

    return NextResponse.json({ 
      success: true, 
      client: {
        name: clientDoc.name || clientDoc.email,
        email: clientDoc.email,
        phone: clientDoc.phone || clientDoc.personalPhone || 'Unmapped'
      },
      metrics: {
        totalCalls: clientCalls.length,
        completedCalls,
        totalMinutes: Math.round(totalMinutes),
      },
      recentLeads
    });

  } catch (error: any) {
    console.error("[CLIENT METRICS ERROR]", error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
